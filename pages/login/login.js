// pages/login/login.js
Page({
  data: {
    role: 'parent', // 'parent' | 'doctor'
    codeValue: '',
    phone: '',
    verifyCode: '',
    sentCode: '', // 存储发出的模拟短信验证码
    isPhoneValid: false,
    countdown: 0,
    isFormValid: false
  },

  timer: null,

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

  onUnload() {
    this.clearCountdown();
  },

  onChangeRole(e) {
    const role = e.currentTarget.dataset.role;
    this.clearCountdown();
    this.setData({
      role: role,
      codeValue: '',
      phone: '',
      verifyCode: '',
      sentCode: '',
      isPhoneValid: false,
      countdown: 0,
      isFormValid: false
    });
  },

  onInputCode(e) {
    const val = e.detail.value.trim();
    this.setData({
      codeValue: val
    }, () => {
      this.validateForm();
    });
  },

  onInputPhone(e) {
    const val = e.detail.value.trim();
    const isValid = /^1[3-9]\d{9}$/.test(val);
    this.setData({
      phone: val,
      isPhoneValid: isValid
    }, () => {
      this.validateForm();
    });
  },

  onInputVerifyCode(e) {
    const val = e.detail.value.trim();
    this.setData({
      verifyCode: val
    }, () => {
      this.validateForm();
    });
  },

  // 发送模拟短信验证码
  onSendVerifyCode() {
    if (!this.data.isPhoneValid || this.data.countdown > 0) return;

    // 随机生成 4 位纯数字验证码
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    this.setData({
      sentCode: code
    }, () => {
      this.validateForm();
    });

    // 弹出模拟短信通知框
    wx.showModal({
      title: '验证码已发送',
      content: `【浦东中医院】您的登录验证码为：${code}，请在页面中输入进行绑定验证。`,
      showCancel: false,
      confirmText: '输入验证码',
      confirmColor: '#0d9488'
    });

    // 开始 60 秒倒计时
    this.setData({ countdown: 60 });
    this.timer = setInterval(() => {
      const time = this.data.countdown - 1;
      this.setData({
        countdown: time
      });
      if (time <= 0) {
        this.clearCountdown();
      }
    }, 1000);
  },

  clearCountdown() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  },

  // 表单完整度及规则校验
  validateForm() {
    const { role, codeValue, phone, verifyCode, sentCode, isPhoneValid } = this.data;
    
    // 1. 基础工号/单号格式长度校验
    const isCodeOk = codeValue.trim().length > 0;
    
    // 2. 手机号校验
    const isPhoneOk = isPhoneValid && phone.length === 11;
    
    // 3. 验证码校验 (必须输入且与发送的验证码完全一致，一定程度上防乱填)
    const isVerifyOk = verifyCode.length > 0 && verifyCode === sentCode;

    this.setData({
      isFormValid: isCodeOk && isPhoneOk && isVerifyOk
    });
  },

  onWechatLogin() {
    if (!this.data.isFormValid) return;

    const { role, codeValue, phone, verifyCode, sentCode } = this.data;
    const code = codeValue.toUpperCase();

    // 双重校验验证码
    if (verifyCode !== sentCode) {
      wx.showModal({
        title: '验证码错误',
        content: '请输入正确的短信验证码。',
        showCancel: false,
        confirmColor: '#0d9488'
      });
      return;
    }

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
      
      // 存储登录态、角色、电话号码以及相对应的就诊ID/工号
      wx.setStorageSync('IS_LOGGED_IN', true);
      wx.setStorageSync('ROLE', role);
      wx.setStorageSync('PHONE', phone);
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
