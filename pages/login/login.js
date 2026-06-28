// pages/login/login.js
const env = require('../../env.js');

Page({
  data: {
    role: 'parent', // 'parent' | 'doctor'
    codeValue: '',
    phone: '',
    verifyCode: '',
    sentCode: '', // 存储发出的开发调试验证码（若走真实短信通道则为空）
    isPhoneValid: false,
    countdown: 0,
    isFormValid: false,
    enableSmsLogin: false // 短信开关，默认从 env.js 获取
  },

  timer: null,

  onLoad() {
    // 读取本地的环境变量短信开关
    this.setData({
      enableSmsLogin: env.ENABLE_SMS_LOGIN || false
    });

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

  // 1. 调用云函数获取短信验证码 (仅在开启短信验证且通过手机正则时可用)
  onSendVerifyCode() {
    if (!this.data.isPhoneValid || this.data.countdown > 0) return;

    wx.showLoading({
      title: '正在发送验证码',
      mask: true
    });

    wx.cloud.callFunction({
      name: 'bookingService',
      data: {
        action: 'sendSmsCode',
        data: {
          phone: this.data.phone,
          smsTemplateId: env.SMS_TEMPLATE_ID || ''
        }
      },
      success: (res) => {
        wx.hideLoading();
        
        if (res.result && res.result.success) {
          const payload = res.result;
          
          // 如果后端返回了调试验证码，说明当前处于开发调试/未开通模式下，我们将其保存在本地便于匹配
          if (payload.isMock && payload.debugCode) {
            this.setData({
              sentCode: payload.debugCode
            }, () => {
              this.validateForm();
            });

            wx.showModal({
              title: '开发调试模式提示',
              content: payload.msg || `未检测到有效短信签名配置，已自动降级至调试模式。\n【测试验证码】：${payload.debugCode}`,
              showCancel: false,
              confirmText: '我知道了',
              confirmColor: '#0d9488'
            });
          } else {
            // 说明调用了真实短信发送成功
            this.setData({
              sentCode: '' // 清空调试码，登录时直接由云端验证
            }, () => {
              this.validateForm();
            });

            wx.showToast({
              title: '验证码已发送',
              icon: 'success'
            });
          }

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

        } else {
          wx.showModal({
            title: '获取失败',
            content: (res.result && res.result.errMsg) || '获取验证码异常，请确保云数据库中创建了 sms_codes 集合。',
            showCancel: false
          });
        }
      },
      fail: (err) => {
        wx.hideLoading();
        console.error('发送验证码失败:', err);
        wx.showModal({
          title: '获取失败',
          content: '调用后台服务失败，请检查网络或部署云函数。',
          showCancel: false
        });
      }
    });
  },

  clearCountdown() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  },

  // 表单完整度校验
  validateForm() {
    const { codeValue, phone, verifyCode, sentCode, isPhoneValid, enableSmsLogin } = this.data;
    
    // 1. 就诊单号/工号必须填写
    const isCodeOk = codeValue.trim().length > 0;
    
    // 如果未开启手机验证码登录，单号填写完毕即可直接点亮登录按钮
    if (!enableSmsLogin) {
      this.setData({
        isFormValid: isCodeOk
      });
      return;
    }

    // 2. 手机号码格式必须正确
    const isPhoneOk = isPhoneValid && phone.length === 11;
    
    // 3. 验证码校验
    // 如果存在本地开发调试验证码（sentCode），则进行本地全等校验。
    // 如果是走真实短信链路，前端只校验验证码长度是否达到4位或6位，真实的匹配操作在点击登录时交由云端处理。
    const isVerifyOk = verifyCode.trim().length >= 4 && (sentCode === '' || verifyCode === sentCode);

    this.setData({
      isFormValid: isCodeOk && isPhoneOk && isVerifyOk
    });
  },

  // 2. 安全登录：调用云函数在服务器进行验证码强匹配与单号检验
  onWechatLogin() {
    if (!this.data.isFormValid) return;

    const { role, codeValue, phone, verifyCode, enableSmsLogin } = this.data;
    const code = codeValue.toUpperCase();

    // 如果没有开启手机号短信验证开关，直接前端验证单号登录 (保持原有纯单号登录行为)
    if (!enableSmsLogin) {
      if (role === 'parent') {
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
        title: '正在安全登录',
        mask: true
      });

      setTimeout(() => {
        wx.hideLoading();
        // 存储本地登录态及参数
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
      return;
    }

    // 开启手机短信验证后的安全云端登录流程
    wx.showLoading({
      title: '正在安全登录',
      mask: true
    });

    wx.cloud.callFunction({
      name: 'bookingService',
      data: {
        action: 'verifyLogin',
        data: {
          role,
          codeValue: code,
          phone,
          verifyCode
        }
      },
      success: (res) => {
        wx.hideLoading();

        if (res.result && res.result.success) {
          // 云端验证成功，存储本地登录态、角色、电话及单号/工号
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

          // 成功登录后根据角色进行主页重定向
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

        } else {
          // 验证失败，显示后台返回的具体错误消息
          wx.showModal({
            title: '验证失败',
            content: (res.result && res.result.errMsg) || '验证失败，请重新检查。',
            showCancel: false,
            confirmColor: '#0d9488'
          });
        }
      },
      fail: (err) => {
        wx.hideLoading();
        console.error('安全登录异常:', err);
        wx.showModal({
          title: '登录异常',
          content: '连接云端登录服务失败，请重试。',
          showCancel: false
        });
      }
    });
  }
})
