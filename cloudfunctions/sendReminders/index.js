const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

// 订阅消息模板 ID (如果您有多个环境或需要动态获取，也可以将其存入数据库集合中读取)
const TEMPLATE_ID = ''; 

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
      // 解析预约时间，格式如: "2026-06-29 10:20"
      const appointTimeStr = `${item.date} ${item.time}`;
      const appointTime = new Date(appointTimeStr.replace(/-/g, '/')); // 兼容各种运行环境的时间解析形式

      // 计算时间差（单位：分钟）
      const diffMs = appointTime.getTime() - now.getTime();
      const diffMins = diffMs / (1000 * 60);

      console.log(`预约单 ID: ${item._id}, 患儿: ${item.patientName}, 时间: ${appointTimeStr}, 距离预约开始: ${diffMins.toFixed(1)} 分钟`);

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

          // 发送订阅消息
          await cloud.openapi.subscribeMessage.send({
            touser: item._openid,
            templateId: activeTemplateId || '请在云端或本地env.js配置订阅模板ID',
            page: 'pages/index/index',
            data: {
              thing1: { value: item.patientName }, // 患儿姓名
              time2: { value: `${item.date} ${item.time}` }, // 预约时间
              thing3: { value: '浦东新区中医医院少儿推拿中心' }, // 地点/科室
              thing4: { value: '请提前15分钟到店签到，不要迟到哦。' } // 温馨提示
            }
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
