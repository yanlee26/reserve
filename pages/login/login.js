// pages/login/login.js
Page({
  data: {
    diagnosisId: '',
    isFormValid: false
  },

  onLoad() {
    // 如果已经登录，直接跳转到主页
    const isLogin = wx.getStorageSync('IS_LOGGED_IN');
    if (isLogin) {
      wx.redirectTo({
        url: '/pages/index/index'
      });
    }
  },

  onInputDiagnosisId(e) {
    const val = e.detail.value.trim();
    this.setData({
      diagnosisId: val,
      isFormValid: val.length > 0
    });
  },

  onWechatLogin() {
    if (!this.data.isFormValid) return;

    const code = this.data.diagnosisId.toUpperCase();
    
    // 校验就诊单号是否符合测试要求 (这里我们设定以 TCM- 开头为合法，或者直接是 TCM-999)
    if (code !== 'TCM-999' && !code.startsWith('TCM-')) {
      wx.showModal({
        title: '验证失败',
        content: '未查询到该就诊诊断单，请确认单号输入是否正确。\n（提示：测试单号为 TCM-999）',
        showCancel: false,
        confirmColor: '#0d9488'
      });
      return;
    }

    wx.showLoading({
      title: '正在授权登录',
      mask: true
    });

    // 模拟授权登录
    setTimeout(() => {
      wx.hideLoading();
      
      // 存储登录态和诊断单号
      wx.setStorageSync('IS_LOGGED_IN', true);
      wx.setStorageSync('DIAGNOSIS_ID', code);

      wx.showToast({
        title: '验证成功',
        icon: 'success',
        duration: 1200
      });

      // 成功登录后重定向到主页
      setTimeout(() => {
        wx.redirectTo({
          url: '/pages/index/index'
        });
      }, 1200);
      
    }, 1000);
  }
})
