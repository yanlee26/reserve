// pages/doctor/doctor.js
const db = require('../../utils/db.js');

Page({
  data: {
    doctorId: '',
    dateList: [],
    selectedDate: '',
    selectedDateShort: '',
    selectedDateStr: '',
    bookings: [],
    loading: false
  },

  onLoad() {
    // 角色与登录安全守卫拦截
    const isLoggedIn = wx.getStorageSync('IS_LOGGED_IN');
    const role = wx.getStorageSync('ROLE');
    
    if (!isLoggedIn || role !== 'doctor') {
      wx.showToast({
        title: '无权限访问',
        icon: 'error'
      });
      wx.redirectTo({
        url: '/pages/login/login'
      });
      return;
    }

    // 设置基本医生参数并构建日历选择器
    const docId = wx.getStorageSync('DOCTOR_ID') || 'DOC-888';
    this.setData({
      doctorId: docId
    });

    this.initDatePicker();
    
    // 加载当前选中日期（今天）的所有预约
    this.loadBookingsForSelectedDate();
  },

  // 1. 生成 15 天的日期滚动选择栏
  initDatePicker() {
    const days = [];
    const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const now = new Date();

    for (let i = 0; i < 15; i++) {
      const targetDate = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
      const year = targetDate.getFullYear();
      const month = String(targetDate.getMonth() + 1).padStart(2, '0');
      const day = String(targetDate.getDate()).padStart(2, '0');
      
      const dateStr = `${year}-${month}-${day}`;
      const dateShort = `${month}-${day}`;
      
      let dayName = weekDays[targetDate.getDay()];
      if (i === 0) dayName = '今天';
      else if (i === 1) dayName = '明天';
      else if (i === 2) dayName = '后天';

      const showStr = `${year}年${month}月${day}日 (${dayName})`;

      days.push({
        date: dateStr,
        dateShort,
        dayName,
        dateStr: showStr
      });
    }

    this.setData({
      dateList: days,
      selectedDate: days[0].date,
      selectedDateShort: days[0].dateShort,
      selectedDateStr: days[0].dateStr
    });
  },

  // 2. 切换查看日期
  onSelectDate(e) {
    const { date, short, str } = e.currentTarget.dataset;
    if (this.data.selectedDate === date) return;

    this.setData({
      selectedDate: date,
      selectedDateShort: short,
      selectedDateStr: str
    }, () => {
      this.loadBookingsForSelectedDate();
    });
  },

  // 3. 异步拉取选定日期下的所有家长的预约记录
  loadBookingsForSelectedDate() {
    this.setData({
      loading: true
    });

    db.getAllBookingsByDate(this.data.selectedDate).then(list => {
      this.setData({
        bookings: list,
        loading: false
      });
    }).catch(err => {
      this.setData({
        loading: false
      });
      console.error('医生端获取预约列表异常:', err);
      wx.showToast({
        title: '获取列表失败',
        icon: 'error'
      });
    });
  },

  // 4. 打电话联系家长
  onCallPatient(e) {
    const phone = e.currentTarget.dataset.phone;
    const name = e.currentTarget.dataset.name;

    if (!phone) return;

    wx.showModal({
      title: '联系家长',
      content: `是否拨打电话联系患儿 ${name} 的家长？\n手机号：${phone}`,
      confirmText: '呼叫',
      success: (res) => {
        if (res.confirm) {
          wx.makePhoneCall({
            phoneNumber: phone,
            fail: (err) => {
              console.warn('拨打电话失败:', err);
            }
          });
        }
      }
    });
  },

  // 5. 退出工作站
  onLogout() {
    wx.showModal({
      title: '提示',
      content: '确认退出医生工作站并切换账号吗？',
      success: (res) => {
        if (res.confirm) {
          wx.clearStorageSync();
          wx.redirectTo({
            url: '/pages/login/login'
          });
        }
      }
    });
  }
})
