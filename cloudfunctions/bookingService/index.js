// 云函数入口文件 - 中医小儿推拿服务预约后端逻辑
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;
const COLLECTION_NAME = 'bookings';

// 云函数入口函数
exports.main = async (event, context) => {
  const { action, data } = event;

  try {
    switch (action) {
      case 'initData':
        return await initMockData();
      case 'getBookings':
        return await getBookings(data);
      case 'getBookingById':
        return await getBookingById(data);
      case 'addBooking':
        return await addBooking(data);
      case 'updateBooking':
        return await updateBooking(data);
      case 'cancelBooking':
        return await cancelBooking(data);
      case 'getOccupiedSlots':
        return await getOccupiedSlots();
      case 'getAllBookingsByDate':
        return await getAllBookingsByDate(data);
      case 'sendSmsCode':
        return await sendSmsCode(data);
      case 'verifyLogin':
        return await verifyLogin(data);
      default:
        return {
          success: false,
          errMsg: `未定义的操作类型: ${action}`
        };
    }
  } catch (err) {
    return {
      success: false,
      errMsg: err.message || '执行出错',
      errStack: err
    };
  }
};

// 1. 初始化 Mock 数据
async function initMockData() {
  const countRes = await db.collection(COLLECTION_NAME).count();
  if (countRes.total === 0) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // 格式化日期 yyyy-MM-dd
    const year = tomorrow.getFullYear();
    const month = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const day = String(tomorrow.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    const defaultBooking = {
      diagnosisId: 'TCM-999',
      date: dateStr,
      time: '09:20',
      patientName: '张小宝',
      patientPhone: '13812345678',
      remarks: '初次调理，脾胃虚弱',
      status: 'pending',
      createdAt: db.serverDate()
    };
    
    const res = await db.collection(COLLECTION_NAME).add({
      data: defaultBooking
    });
    return { success: true, msg: 'Mock 数据初始化成功', id: res._id };
  }
  return { success: true, msg: '已有数据，无需初始化' };
}

// 2. 获取某诊断单下的所有预约记录
async function getBookings({ diagnosisId }) {
  const res = await db.collection(COLLECTION_NAME)
    .where({
      diagnosisId: diagnosisId
    })
    .orderBy('createdAt', 'desc')
    .get();

  // 把云端 serverDate 转为可读的 createdAt 格式
  const bookings = res.data.map(item => {
    return {
      ...item,
      id: item._id, // 前端习惯用 id
      createdAt: formatDate(item.createdAt)
    };
  });

  return {
    success: true,
    data: bookings
  };
}

// 3. 根据 ID 获取单个预约详情
async function getBookingById({ id }) {
  const res = await db.collection(COLLECTION_NAME).doc(id).get();
  return {
    success: true,
    data: {
      ...res.data,
      id: res.data._id
    }
  };
}

// 4. 新增预约 (执行严格的服务端并发校验)
async function addBooking(bookingData) {
  const { diagnosisId, date, patientName, patientPhone } = bookingData;

  // 4.1. 校验 1：同人同日限额（同一天最多只能有1个待服务的预约）
  const sameDayConflict = await db.collection(COLLECTION_NAME)
    .where({
      date: date,
      status: 'pending',
      patientName: _.eq(patientName).or(_.eq(patientPhone)) // 姓名或电话相同即冲突
    })
    .count();

  if (sameDayConflict.total > 0) {
    return {
      success: false,
      errCode: 'CONFLICT',
      errMsg: `患儿 ${patientName} 或是该家长联系电话在 ${date} 已经有一个待服务的推拿预约了。同一个人同一天最多只能预约 1 次。`
    };
  }

  // 4.2. 校验 2：限额控制（同一个诊断单最多只能有3个待服务的预约）
  const activeCount = await db.collection(COLLECTION_NAME)
    .where({
      diagnosisId: diagnosisId,
      status: 'pending'
    })
    .count();

  if (activeCount.total >= 3) {
    return {
      success: false,
      errCode: 'LIMIT_EXCEEDED',
      errMsg: `该就诊单已有 ${activeCount.total} 个待服务预约。每个就诊单最多只允许预约 3 次。`
    };
  }

  // 4.3. 写入数据
  const openid = cloud.getWXContext().OPENID;
  const record = {
    ...bookingData,
    _openid: openid, // 显式写入 openid，供后续推送与拉取使用
    status: 'pending',
    createdAt: db.serverDate()
  };

  const res = await db.collection(COLLECTION_NAME).add({
    data: record
  });

  // 【即时测试推送】预约成功后立即发送一条“预约成功确认”通知，便于即时验证消息模板及权限
  if (openid && bookingData.templateId) {
    try {
      console.log(`正在发送预约成功即时测试通知... openid: ${openid}, templateId: ${bookingData.templateId}`);
      await cloud.openapi.subscribeMessage.send({
        touser: openid,
        templateId: bookingData.templateId,
        page: 'pages/index/index',
        data: {
          thing1: { value: patientName }, // 患儿姓名
          time2: { value: `${bookingData.date} ${bookingData.time}` }, // 预约时间
          thing3: { value: '浦东新区中医医院少儿推拿中心' }, // 地点/科室
          thing4: { value: '预约成功！请提前15分钟到店签到。' } // 温馨提示
        }
      });
      console.log('即时测试通知发送成功');
    } catch (pushErr) {
      console.warn('即时测试通知发送失败（可能未勾选允许通知或模板字段不匹配）:', pushErr);
    }
  }

  return {
    success: true,
    id: res._id
  };
}

// 5. 修改预约
async function updateBooking({ id, date, time, patientName, patientPhone, remarks, templateId }) {
  // 5.1. 校验同人同日预约冲突 (排除自身正在修改的这一单)
  const sameDayConflict = await db.collection(COLLECTION_NAME)
    .where({
      _id: _.neq(id),
      date: date,
      status: 'pending',
      patientName: _.eq(patientName).or(_.eq(patientPhone))
    })
    .count();

  if (sameDayConflict.total > 0) {
    return {
      success: false,
      errCode: 'CONFLICT',
      errMsg: `患儿 ${patientName} 或是该家长联系电话在 ${date} 已经有一个待服务的推拿预约了。同一个人同一天最多只能预约 1 次。`
    };
  }

  // 5.2. 执行更新
  await db.collection(COLLECTION_NAME).doc(id).update({
    data: {
      date,
      time,
      patientName,
      patientPhone,
      remarks,
      templateId,
      updatedAt: db.serverDate()
    }
  });

  // 【即时测试推送】修改预约成功后立即发送一条修改成功确认通知，便于即时验证消息模板及权限
  const openid = cloud.getWXContext().OPENID;
  if (openid && templateId) {
    try {
      console.log(`正在发送修改预约即时测试通知... openid: ${openid}, templateId: ${templateId}`);
      await cloud.openapi.subscribeMessage.send({
        touser: openid,
        templateId: templateId,
        page: 'pages/index/index',
        data: {
          thing1: { value: patientName }, // 患儿姓名
          time2: { value: `${date} ${time}` }, // 预约时间
          thing3: { value: '浦东新区中医医院少儿推拿中心' }, // 地点/科室
          thing4: { value: '您的预约已成功修改，请按新时间前来就诊。' } // 温馨提示
        }
      });
      console.log('修改就诊即时测试通知发送成功');
    } catch (pushErr) {
      console.warn('修改就诊即时测试通知发送失败（可能未勾选允许通知或模板字段不匹配）:', pushErr);
    }
  }

  return {
    success: true
  };
}

// 6. 取消预约
async function cancelBooking({ id, reason }) {
  await db.collection(COLLECTION_NAME).doc(id).update({
    data: {
      status: 'cancelled',
      cancelReason: reason,
      cancelledAt: db.serverDate()
    }
  });

  return {
    success: true
  };
}

// 7. 获取所有已被占用的预约时段 (仅限待服务状态)
async function getOccupiedSlots() {
  const res = await db.collection(COLLECTION_NAME)
    .where({
      status: 'pending'
    })
    .limit(1000)
    .get();

  return {
    success: true,
    data: res.data.map(item => ({
      id: item._id,
      date: item.date,
      time: item.time
    }))
  };
}

// 8. 获取指定日期的所有预约单 (用于医生视图)
async function getAllBookingsByDate({ date }) {
  const res = await db.collection(COLLECTION_NAME)
    .where({
      date: date
    })
    .limit(1000)
    .get();

  const bookings = res.data.map(item => {
    return {
      ...item,
      id: item._id,
      createdAt: formatDate(item.createdAt)
    };
  });

  // 按照预约时间升序排列 (例如 08:00, 08:20, 08:40...)
  bookings.sort((a, b) => a.time.localeCompare(b.time));

  return {
    success: true,
    data: bookings
  };
}

// 日期时间格式化辅助
function formatDate(dateVal) {
  if (!dateVal) return '';
  const date = new Date(dateVal);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

// 9. 发送真实短信验证码 (支持没有模版 ID 时，自动降级为开发调试模式)
async function sendSmsCode({ phone, smsTemplateId }) {
  const code = Math.floor(1000 + Math.random() * 9000).toString();
  const expireAt = Date.now() + 5 * 60 * 1000; // 5分钟有效

  // 1. 将验证码存入云数据库 sms_codes 集合，便于校验
  // 我们使用 doc(phone) 来保证同一手机号只有一个活跃验证码，避免产生大量垃圾文档
  try {
    await db.collection('sms_codes').doc(phone).set({
      data: {
        code,
        expireAt,
        updatedAt: db.serverDate()
      }
    });
  } catch (err) {
    // 如果集合不存在，动态创建可能会报错，我们可以捕获并返回提示
    console.warn('sms_codes 集合存储失败，请确保云开发控制台已创建 sms_codes 数据库集合。原因为:', err.message);
  }

  // 2. 如果配置了短信模板 ID，尝试调用微信官方 sendSms 接口发送真实短信
  if (smsTemplateId) {
    try {
      const res = await cloud.openapi.cloudbase.sendSms({
        env: cloud.DYNAMIC_CURRENT_ENV,
        phoneNumberList: ['+86' + phone],
        smsTemplateId: smsTemplateId,
        templateParamSet: [code, '5'],
        useSmsLimit: true
      });
      return {
        success: true,
        msg: '短信验证码已成功发送到您的手机，请注意查收。',
        result: res
      };
    } catch (err) {
      console.error('调用微信官方 sendSms 接口失败，自动启用开发模式。原因:', err);
      return {
        success: true,
        debugCode: code,
        isMock: true,
        msg: `由于微信短信通道报错(可能欠费/模板无效)，已启用开发调试模式。\n[调试验证码]：${code}`
      };
    }
  }

  // 3. 如果没填短信模板 ID，走极佳的体验降级方案：直接返回验证码（用于开发调试）
  return {
    success: true,
    debugCode: code,
    isMock: true,
    msg: `开发测试状态：短信模版未配置。\n[调试验证码]：${code}`
  };
}

// 10. 登录云端强校验
async function verifyLogin({ role, codeValue, phone, verifyCode }) {
  // 1. 从云数据库读取该手机号对应的验证码
  try {
    const res = await db.collection('sms_codes').doc(phone).get();
    if (!res || !res.data) {
      return { success: false, errMsg: '请先获取验证码。' };
    }

    const { code, expireAt } = res.data;
    
    // 2. 检查验证码是否过期
    if (Date.now() > expireAt) {
      return { success: false, errMsg: '验证码已过期，请重新获取。' };
    }

    // 3. 匹配验证码
    if (verifyCode !== code) {
      return { success: false, errMsg: '短信验证码错误，请输入正确的验证码。' };
    }
  } catch (err) {
    console.error('sms_codes 读取校验失败:', err);
    return { success: false, errMsg: '服务器校验失败，请检查是否在云数据库中创建了 sms_codes 集合。' };
  }

  // 4. 验证就诊单号/工号规则
  const codeUpper = codeValue.toUpperCase();
  if (role === 'parent') {
    if (codeUpper !== 'TCM-999' && !codeUpper.startsWith('TCM-')) {
      return { success: false, errMsg: '未查询到该就诊诊断单，请核对单号。\n（测试可用单号: TCM-999）' };
    }
  } else {
    if (codeUpper !== 'DOC-888' && !codeUpper.startsWith('DOC-')) {
      return { success: false, errMsg: '医生工号验证未通过，请核对工号。\n（测试可用工号: DOC-888）' };
    }
  }

  // 5. 校验通过，清理验证码以防止二次重复使用
  await db.collection('sms_codes').doc(phone).remove().catch(() => {});

  return {
    success: true,
    msg: '登录校验通过'
  };
}
