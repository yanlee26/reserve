// Mock 数据库服务 - 重构为小程序云数据库与云函数适配器

// 1. 初始化 Mock 数据
function initData() {
  wx.cloud.callFunction({
    name: 'bookingService',
    data: {
      action: 'initData'
    },
    success: res => {
      console.log('云开发数据初始化:', res.result);
    },
    fail: err => {
      console.error('云开发数据初始化失败:', err);
    }
  });
}

// 2. 获取某诊断单下的所有预约记录
function getBookings(diagnosisId) {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name: 'bookingService',
      data: {
        action: 'getBookings',
        data: { diagnosisId }
      },
      success: res => {
        if (res.result && res.result.success) {
          resolve(res.result.data || []);
        } else {
          reject(res.result || { errMsg: '获取预约记录失败' });
        }
      },
      fail: err => {
        reject(err);
      }
    });
  });
}

// 3. 根据 ID 获取单个预约记录
function getBookingById(id) {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name: 'bookingService',
      data: {
        action: 'getBookingById',
        data: { id }
      },
      success: res => {
        if (res.result && res.result.success) {
          resolve(res.result.data);
        } else {
          reject(res.result || { errMsg: '获取预约详情失败' });
        }
      },
      fail: err => {
        reject(err);
      }
    });
  });
}

// 4. 新增预约
function addBooking(booking) {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name: 'bookingService',
      data: {
        action: 'addBooking',
        data: booking
      },
      success: res => {
        resolve(res.result); // 直接返回结果，包含 success, errCode, errMsg, id
      },
      fail: err => {
        reject(err);
      }
    });
  });
}

// 5. 修改预约
function updateBooking(id, date, time, patientName, patientPhone, remarks = '', templateId = '') {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name: 'bookingService',
      data: {
        action: 'updateBooking',
        data: {
          id,
          date,
          time,
          patientName,
          patientPhone,
          remarks,
          templateId
        }
      },
      success: res => {
        resolve(res.result);
      },
      fail: err => {
        reject(err);
      }
    });
  });
}

// 6. 取消预约
function cancelBooking(id, reason) {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name: 'bookingService',
      data: {
        action: 'cancelBooking',
        data: { id, reason }
      },
      success: res => {
        if (res.result && res.result.success) {
          resolve(true);
        } else {
          resolve(false);
        }
      },
      fail: err => {
        reject(err);
      }
    });
  });
}

// 7. 获取已被占用的时段
function getOccupiedSlots() {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name: 'bookingService',
      data: {
        action: 'getOccupiedSlots'
      },
      success: res => {
        if (res.result && res.result.success) {
          resolve(res.result.data || []);
        } else {
          reject(res.result || { errMsg: '获取占用时段失败' });
        }
      },
      fail: err => {
        reject(err);
      }
    });
  });
}

// 8. 获取指定日期的所有预约单 (医生端使用)
function getAllBookingsByDate(date) {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name: 'bookingService',
      data: {
        action: 'getAllBookingsByDate',
        data: { date }
      },
      success: res => {
        if (res.result && res.result.success) {
          resolve(res.result.data || []);
        } else {
          reject(res.result || { errMsg: '获取预约列表失败' });
        }
      },
      fail: err => {
        reject(err);
      }
    });
  });
}

module.exports = {
  initData,
  getBookings,
  getBookingById,
  addBooking,
  updateBooking,
  cancelBooking,
  getOccupiedSlots,
  getAllBookingsByDate
};
