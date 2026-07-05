const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

// 订阅消息模板 ID (安全回退默认值，与 env.js 保持同步)
const TEMPLATE_ID = 'QOS0o9srkEjZ1VULK1cNVAEdzzrevdtEGSUDvL75P3E';

// 门诊所在时区：新西兰奥克兰
// 注意：奥克兰有夏令时切换 (NZDT +13:00 大约每年9月最后一个周日 ~ 次年4月第一个周日，其余时间为 NZST +12:00)，
// 不能像之前的北京时间那样用固定偏移量 "+08:00"，否则每年会有约半年时间产生 1 小时误差。
const APPOINTMENT_TIMEZONE = 'Pacific/Auckland';

// 将预约单上保存的 "YYYY-MM-DD" + "HH:mm" 解读为奥克兰本地墙上时间，返回其对应的正确 UTC 时刻。
// 原理：先假设该墙上时间就是 UTC 得到一个初始猜测时刻，再用 Intl API 查出该猜测时刻在奥克兰当地实际显示的时间，
// 两者之差即为当时适用的时区偏移量（自动识别是否处于夏令时），据此修正得到真实的 UTC 时刻。
function aucklandWallTimeToUtc(dateStr, timeStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);

  const guessUtc = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));

  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: APPOINTMENT_TIMEZONE,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  const parts = dtf.formatToParts(guessUtc).reduce((acc, p) => {
    if (p.type !== 'literal') acc[p.type] = parseInt(p.value, 10);
    return acc;
  }, {});
  if (parts.hour === 24) parts.hour = 0; // 部分环境会把午夜格式化为 24 而非 0

  const asIfLocalUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  const offsetMs = guessUtc.getTime() - asIfLocalUtc;

  return new Date(guessUtc.getTime() + offsetMs);
}

exports.main = async (event, context) => {
  const now = new Date();
  console.log('开始扫描预约提醒，当前服务器时间:', now);

  try {
    // 1. 查询所有未提醒、待服务的预约单
    const res = await db.collection('bookings')
      .where({
        status: 'pending',
        reminderSent: _.neq(true)
      })
      .limit(100) // 每次定时任务限制处理100条
      .get();

    const bookings = res.data;
    console.log(`查询到 ${bookings.length} 条待处理的预约单`);

    let sentCount = 0;
    let skipCount = 0;
    let failCount = 0;

    for (const item of bookings) {
      // 按奥克兰本地时间解读预约单上的日期与时间，自动处理夏令时，解决云开发服务器 Node 环境默认 UTC 时区导致的时间偏移问题
      const appointTime = aucklandWallTimeToUtc(item.date, item.time);

      // 计算当前实际时间与预约时间的时间差（单位：分钟）
      const diffMs = appointTime.getTime() - now.getTime();
      const diffMins = diffMs / (1000 * 60);

      console.log(`预约单 ID: ${item._id}, 患儿: ${item.patientName}, 奥克兰本地时间: ${item.date} ${item.time}, 距离预约开始: ${diffMins.toFixed(1)} 分钟`);

      // 当距离预约开始时间在 2 小时（120分钟）加 10 分钟缓冲区内（即 130 分钟内），且预约尚未过期（diffMins > 0）
      if (diffMins > 0 && diffMins <= 130) {
        if (!item._openid) {
          console.log(`预约单 ${item._id} 没有绑定用户的 openid (可能是系统预置测试数据)，跳过推送并标记`);
          await markReminderSent(item._id);
          skipCount++;
          continue;
        }

        try {
          // 优先使用预约单上保存的模板ID，实现动态配置并保持 DRY 原则
          const activeTemplateId = item.templateId || TEMPLATE_ID;

          // 使用万能数据包生成器构建全覆盖属性，自动适配用户自定义模版，避免 47003 缺失字段错
          const sendData = buildUniversalPayload({
            patientName: item.patientName,
            date: item.date,
            time: item.time,
            remarks: item.remarks,
            diagnosisId: item.diagnosisId
          });

          // 发送订阅消息
          await cloud.openapi.subscribeMessage.send({
            touser: item._openid,
            templateId: activeTemplateId || '请在云端或本地env.js配置订阅模板ID',
            page: 'pages/index/index',
            data: sendData
          });

          console.log(`成功为预约单 ${item._id} (用户 ${item._openid}) 推送消息提醒`);
          await markReminderSent(item._id);
          sentCount++;
        } catch (sendErr) {
          console.error(`为预约单 ${item._id} 发送推送失败:`, sendErr);
          
          // 如果是用户拒绝订阅或取消授权类的错误，也标记已提醒，防止定时任务死循环重试
          // 常见微信错误码：43101 (拒绝接受订阅), 47003 (版面不符) 等
          if (sendErr.errCode === 43101 || sendErr.errCode === 47003) {
            await markReminderSent(item._id);
            skipCount++;
          } else {
            failCount++;
          }
        }
      }
    }

    return {
      success: true,
      sentCount,
      skipCount,
      failCount,
      msg: `提醒扫描完成。发送: ${sentCount}, 忽略: ${skipCount}, 失败: ${failCount}`
    };
  } catch (err) {
    console.error('发送提醒云函数内部错误:', err);
    return {
      success: false,
      errMsg: err.message
    };
  }
};

async function markReminderSent(id) {
  await db.collection('bookings').doc(id).update({
    data: {
      reminderSent: true,
      reminderSentAt: db.serverDate()
    }
  });
}

// 按微信公众平台后台实际配置的「预约通知」模板精确赋值（字段编号来自微信订阅消息模板列表接口返回的模板 content）：
// 温馨提示 -> thing8，开始时间 -> time22，就诊人 -> thing65，就诊时间 -> time67
// 注：微信关键词库编号是全局共享分配，不按模板内顺序从 1 递增，此前用「1-N 遍历猜测」的方式两次遗漏了
// 高编号字段（time22、thing65）导致 47003，因此改为按模板真实字段精确赋值。
function buildUniversalPayload({ patientName, date, time, remarks, diagnosisId }) {
  const timeStr = `${date} ${time}`;
  const tips = '请提前15分钟到店签到，不要迟到哦。';

  return {
    thing8: { value: truncateString(tips, 20) },
    time22: { value: timeStr },
    thing65: { value: truncateString(patientName, 20) },
    time67: { value: timeStr }
  };
}

function truncateString(str, maxLength) {
  if (!str) return '';
  return str.length > maxLength ? str.slice(0, maxLength - 1) + '…' : str;
}
