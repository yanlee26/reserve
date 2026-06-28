// pages/login/login.js
Page({
  data: {
    role: 'parent', // 'parent' | 'doctor'
    codeValue: '',
    isFormValid: false
  },

  onLoad() {
    // 如果已经登录，根据角色重定向到对应主页
    const isLogin = wx.getStorageSync('IS_LOGGED_IN');
    if (isLogin) {
      const userRole = wx.getStorageSync('ROLE') || 'parent';
      if (userRole === 'doctor') {
        wx.redirectTo({
          url: '/pages/doctor/doctor'
        });
      } else {
        wx.redirectTo({
          url: '/pages/index/index'
        });
      }
    }
  },

  onChangeRole(e) {
    const role = e.currentTarget.dataset.role;
    this.setData({
      role: role,
      codeValue: '',
      isFormValid: false
    });
  },

  onInputCode(e) {
    const val = e.detail.value.trim();
    this.setData({
      codeValue: val,
      isFormValid: val.length > 0
    });
  },

  onWechatLogin() {
    if (!this.data.isFormValid) return;

    const { role, codeValue } = this.data;
    const code = codeValue.toUpperCase();

    if (role === 'parent') {
      // 家长登录规则：以 TCM- 开头或等于 TCM-999
      if (code !== 'TCM-999' && !code.startsWith('TCM-')) {
        wx.showModal({
          title: '验证失败',
          content: '未查询到该就诊诊断单，请确认单号输入是否正确。\n（提示：测试单号为 TCM-999）',
          showCancel: false,
          confirmColor: '#0d9488'
        });
        return;
      }
    } else {
      // 医生登录规则：以 DOC- 开头或等于 DOC-888
      if (code !== 'DOC-888' && !code.startsWith('DOC-')) {
        wx.showModal({
          title: '验证失败',
          content: '医生工号验证未通过，请确认输入是否正确。\n（提示：测试工号为 DOC-888）',
          showCancel: false,
          confirmColor: '#0d9488'
        });
        return;
      }
    }

    wx.showLoading({
      title: '正在授权登录',
      mask: true
    });

    // 模拟授权登录
    setTimeout(() => {
      wx.hideLoading();
      
      // 存储登录态、角色以及相对应的就诊ID/工号
      wx.setStorageSync('IS_LOGGED_IN', true);
      wx.setStorageSync('ROLE', role);
      if (role === 'parent') {
        wx.setStorageSync('DIAGNOSIS_ID', code);
      } else {
        wx.setStorageSync('DOCTOR_ID', code);
      }

      wx.showToast({
        title: '验证成功',
        icon: 'success',
        duration: 1200
      });

      // 成功登录后根据角色重定向
      setTimeout(() => {
        if (role === 'doctor') {
          wx.redirectTo({
            url: '/pages/doctor/doctor'
          });
        } else {
          wx.redirectTo({
            url: '/pages/index/index'
          });
        }
      }, 1200);
      
    }, 1000);
  }
})
