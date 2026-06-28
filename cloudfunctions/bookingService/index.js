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
  const record = {
    ...bookingData,
    status: 'pending',
    createdAt: db.serverDate()
  };

  const res = await db.collection(COLLECTION_NAME).add({
    data: record
  });

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
