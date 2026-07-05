const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

// 订阅消息模板 ID (安全回退默认值，与 env.js 保持同步)
const TEMPLATE_ID = 'QOS0o9srkEjZ1VULK1cNVAEdzzrevdtEGSUDvL75P3E'; 

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
      // 显式指定北京时间时区 (+08:00)，解决云开发服务器 Node 环境默认 UTC 时区导致的 8 小时时间偏移问题
      // 转换后格式如: "2026-06-29T10:20:00+08:00"
      const appointTimeStr = `${item.date}T${item.time}:00+08:00`;
      const appointTime = new Date(appointTimeStr);

      // 计算当前实际时间与预约时间的时间差（单位：分钟）
      const diffMs = appointTime.getTime() - now.getTime();
      const diffMins = diffMs / (1000 * 60);

      console.log(`预约单 ID: ${item._id}, 患儿: ${item.patientName}, CST时间: ${appointTimeStr}, 距离预约开始: ${diffMins.toFixed(1)} 分钟`);

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

// 万能订阅消息数据包生成器：批量覆盖 thing1-20, character_string1-20, name1-20, time1-20, date1-20, phrase1-20 属性
// 满足任意包含 thing8, time11, character_string1 等自定义组合字段的模板，确保不产生 47003 校验缺失错
function buildUniversalPayload({ patientName, date, time, remarks, diagnosisId }) {
  const timeStr = `${date} ${time}`;
  const deptName = '浦东新区中医医院少儿推拿中心';
  const tips = '请提前15分钟到店签到，不要迟到哦。';
  const displayRemarks = remarks || '无症状备注';
  const displayId = diagnosisId || 'TCM-999';

  const payload = {};
  
  for (let i = 1; i <= 20; i++) {
    // thing 字段 (最长 20 字符)
    if (i === 1 || i === 2) {
      payload[`thing${i}`] = { value: truncateString(patientName, 20) };
    } else if (i === 3 || i === 8 || i === 12) {
      payload[`thing${i}`] = { value: truncateString(deptName, 20) };
    } else if (i === 4 || i === 5 || i === 6 || i === 7 || i === 10) {
      payload[`thing${i}`] = { value: truncateString(tips, 20) };
    } else {
      payload[`thing${i}`] = { value: truncateString(displayRemarks, 20) };
    }

    // character_string 字段 (最长 32 字符)
    payload[`character_string${i}`] = { value: truncateString(displayId, 32) };

    // name 字段 (最长 10 字符)
    payload[`name${i}`] = { value: truncateString(patientName, 10) };

    // time / date / phrase 字段
    payload[`time${i}`] = { value: timeStr };
    payload[`date${i}`] = { value: date };
    payload[`phrase${i}`] = { value: '预约成功' };
  }

  return payload;
}

function truncateString(str, maxLength) {
  if (!str) return '';
  return str.length > maxLength ? str.slice(0, maxLength - 1) + '…' : str;
}
