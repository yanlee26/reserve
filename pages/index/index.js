// pages/index/index.js
const db = require('../../utils/db.js');

Page({
  data: {
    bookings: [],
    showNoticeModal: false,
    diagnosisId: ''
  },

  onLoad() {
    // 检查登录态，防止绕过登录页
    const isLoggedIn = wx.getStorageSync('IS_LOGGED_IN');
    if (!isLoggedIn) {
      wx.redirectTo({
        url: '/pages/login/login'
      });
      return;
    }

    // 角色安全守卫：若是医生，重定向至医生端工作站
    const role = wx.getStorageSync('ROLE') || 'parent';
    if (role === 'doctor') {
      wx.redirectTo({
        url: '/pages/doctor/doctor'
      });
      return;
    }

    // 显式启用“分享给朋友”和“分享到朋友圈”按钮
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    });
  },

  onShow() {
    this.loadMyBookings();
    this.setData({
      diagnosisId: wx.getStorageSync('DIAGNOSIS_ID') || 'TCM-999'
    });

    // 双重保障：在 onShow 中也显式开启分享菜单，确保渲染完成后菜单是激活状态
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    });
  },

  loadMyBookings() {
    wx.showNavigationBarLoading();
    const diagnosisId = wx.getStorageSync('DIAGNOSIS_ID') || 'TCM-999';
    db.getBookings(diagnosisId).then(list => {
      wx.hideNavigationBarLoading();
      this.setData({
        bookings: list
      });
    }).catch(err => {
      wx.hideNavigationBarLoading();
      console.error('加载预约记录失败:', err);
    });
  },

  onCancelBooking(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认要取消此推拿预约吗？',
      content: '',
      editable: true,
      placeholderText: '请输入取消原因',
      success: (res) => {
        if (res.confirm) {
          const reason = res.content.trim() || '用户自取消';
          wx.showLoading({
            title: '正在提交',
            mask: true
          });
          
          db.cancelBooking(id, reason).then(success => {
            wx.hideLoading();
            if (success) {
              wx.showToast({
                title: '已取消预约',
                icon: 'success'
              });
              this.loadMyBookings();
            } else {
              wx.showToast({
                title: '取消失败，请重试',
                icon: 'none'
              });
            }
          }).catch(err => {
            wx.hideLoading();
            wx.showModal({
              title: '提示',
              content: '网络异常，取消失败',
              showCancel: false
            });
          });
        }
      }
    });
  },

  goToBook() {
    wx.navigateTo({
      url: '/pages/book/book'
    });
  },

  goToEdit(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/book/book?editId=${id}`
    });
  },

  showNotice() {
    this.setData({
      showNoticeModal: true
    });
  },

  closeNotice() {
    this.setData({
      showNoticeModal: false
    });
  },

  onLogout() {
    wx.showModal({
      title: '提示',
      content: '确认退出登录并切换账号吗？',
      success: (res) => {
        if (res.confirm) {
          wx.clearStorageSync();
          wx.redirectTo({
            url: '/pages/login/login'
          });
        }
      }
    });
  },

  // 1. 发送给朋友
  onShareAppMessage() {
    return {
      title: '浦东新区中医医院 - 少儿推拿中心预约',
      path: '/pages/index/index'
    };
  },

  // 2. 分享到朋友圈
  onShareTimeline() {
    return {
      title: '浦东新区中医医院 - 少儿推拿中心预约',
      query: 'from=moments'
    };
  }
})
