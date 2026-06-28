// pages/doctor/doctor.js
const db = require('../../utils/db.js');

Page({
  data: {
    doctorId: '',
    dateList: [],
    selectedDate: '',
    selectedDateShort: '',
    selectedDateStr: '',
    bookings: [], // 原始预约数据
    morningSlots: [], // 上午时间段网格数据
    afternoonSlots: [], // 下午时间段网格数据
    loading: false,
    showDetailModal: false, // 是否展示详情弹窗
    activeBooking: null // 当前弹窗里展示的预约数据
  },

  onLoad() {
    // 角色安全与登录状态双重守卫
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

    const docId = wx.getStorageSync('DOCTOR_ID') || 'DOC-888';
    this.setData({
      doctorId: docId
    });

    this.initDatePicker();
    this.loadBookingsForSelectedDate();
  },

  // 1. 初始化 15 天滚动日历数据
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

  // 2. 选择查看不同日期的预约网格
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

  // 3. 异步拉取当日预约，并渲染三色时间网格
  loadBookingsForSelectedDate() {
    this.setData({
      loading: true,
      showDetailModal: false,
      activeBooking: null
    });

    db.getAllBookingsByDate(this.data.selectedDate).then(list => {
      this.setData({
        bookings: list
      }, () => {
        this.generateTimeGrid();
      });
    }).catch(err => {
      this.setData({
        loading: false
      });
      console.error('医生端拉取日程冲突:', err);
      wx.showToast({
        title: '获取列表失败',
        icon: 'error'
      });
    });
  },

  // 4. 将后端查出的预约匹配到 20 分钟时间网格中 (空闲=绿，已约=黄，取消=红)
  generateTimeGrid() {
    const morningTimes = [
      '08:00', '08:20', '08:40', '09:00', '09:20', '09:40',
      '10:00', '10:20', '10:40', '11:00', '11:20', '11:40'
    ];
    const afternoonTimes = [
      '13:00', '13:20', '13:40', '14:00', '14:20', '14:40',
      '15:00', '15:20', '15:40', '16:00', '16:20', '16:40'
    ];

    const rawList = this.data.bookings;

    const mapTimeSlots = (times) => {
      return times.map(timeStr => {
        // 查找该时间段的预约
        // 1. 优先寻找待服务的活跃预约
        let matchBooking = rawList.find(b => b.time === timeStr && b.status === 'pending');
        let state = 'empty';

        if (matchBooking) {
          state = 'pending'; // 黄色：已约待服务
        } else {
          // 2. 若没有活跃预约，再看是否有已取消的预约
          matchBooking = rawList.find(b => b.time === timeStr && b.status === 'cancelled');
          if (matchBooking) {
            state = 'cancelled'; // 红色：取消
          }
        }

        return {
          time: timeStr,
          state: state, // 'empty' | 'pending' | 'cancelled'
          booking: matchBooking || null
        };
      });
    };

    this.setData({
      morningSlots: mapTimeSlots(morningTimes),
      afternoonSlots: mapTimeSlots(afternoonTimes),
      loading: false
    });
  },

  // 5. 点击时间单元网格
  onSlotClick(e) {
    const { slot } = e.currentTarget.dataset;
    
    if (slot.state === 'empty') {
      wx.showToast({
        title: '该时段暂无预约',
        icon: 'none'
      });
      return;
    }

    // 展示详情弹窗
    this.setData({
      activeBooking: slot.booking,
      showDetailModal: true
    });
  },

  // 6. 关闭详情弹窗
  closeDetailModal() {
    this.setData({
      showDetailModal: false,
      activeBooking: null
    });
  },

  // 阻止弹窗内冒泡，防止点击弹窗内部导致关闭
  onModalInnerClick() {},

  // 7. 医生拨打家长电话
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
              console.warn('呼叫失败:', err);
            }
          });
        }
      }
    });
  },

  // 8. 退出登录
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
