// pages/login/login.js
const env = require('../../env.js');

const serviceAgreementText = `《用户服务协议》

欢迎您使用“少儿推拿中心预约”小程序服务。本协议是您与上海市浦东新区中医医院（以下简称“本院”）就少儿推拿中心挂号预约及相关服务所订立的条款。请您在注册或登录前仔细阅读：

一、服务内容
1. 本小程序旨在为持有本院线下就诊单/处方单的少儿患者提供便捷的线上疗程推拿预约、时段修改及取消登记服务。
2. 医生端用户可通过本工作站预览各时段排班与患者登记明细，方便诊疗工作准备。

二、用户注册与信息安全
1. 您在登录本小程序时，需要绑定您持有的就诊诊断单号（或医生工号）、家长手机号码并接受短信验证。
2. 您必须保证提供的信息真实、有效、完整。如因信息虚假导致无法就诊或接收通知，本院不承担责任。
3. 本院承诺对您的个人信息（包含手机号、患儿姓名、备注症状等）采用高强度数据传输与数据库加密存储，未经法律授权或您的书面许可，绝不对外公开或向第三方商业机构披露。

三、预约使用准则
1. 每日推拿班次名额有限，请您在就诊前至少提前1天进行预约。
2. 同一就诊单号每日仅允许预约1个时段，总预约未就诊上限为3次。
3. 如因故无法按时前来，请至少提前2小时在系统中取消或修改预约，以将名额留给其他急需治疗的患儿。

四、免责声明
如因网络延迟、系统升级、不可抗力等非本院故意原因导致预约失败、订阅通知未及时送达，本院将全力协调线下人工挂号处理，但不承担由此引发的间接法律责任。`;

const privacyPolicyText = `《隐私政策》

上海市浦东新区中医医院少儿推拿中心（以下简称“我们”）高度重视用户个人隐私及个人信息安全。本政策详细阐述了我们在您使用本预约小程序时，收集、使用、存储及共享个人信息的方式、目的和用途：

一、我们收集哪些信息
1. 身份识别信息：包含患儿姓名、医生开具的诊断单号（或医生的执业验证工号）。
2. 联系方式信息：家长的手机号码。
3. 诊疗辅助信息：家长在备注中勾选或填写的备注症状（如生长发育、夜啼、消化不良等症状特征）。

二、我们如何使用这些信息
1. 提供预约服务：使用您的诊断单号与手机号识别并验证患儿线下建档资格，以便录入推拿时段。
2. 发送服务通知：利用您的手机号发送短信验证码，以及在预约时间前2小时通过微信订阅消息通道发送就诊提醒，确保您按时就诊。
3. 医护阅览：医生可以通过医生工作站核对当日预约列表中的患儿姓名、联系电话以及备注症状，以便提前准备推拿器具及诊疗方案。

三、信息存储与网络传输安全
1. 我们的所有业务数据（包含您的手机号和患儿资料）均直接传输并存储于腾讯云微信云开发（CloudBase）专属安全数据库中。
2. 数据库采用云端多重安全加密防泄漏策略，仅授权儿童保健科相关医护人员进行内部工作查阅。
3. 我们承诺绝不向任何第三方商业机构或个人出售、共享、披露或转让您的个人信息。

四、您的信息控制权
1. 您可以在小程序首页中随时查询、修改或删除（取消）您的预约登记信息。
2. 当您的推拿疗程预约取消或就诊完成后，相应的信息记录会被归档，您也可以联系本院儿童保健科人工窗口进行历史数据的删除申请。`;

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
    enableSmsLogin: false, // 短信开关，默认从 env.js 获取
    isAgreed: false, // 是否勾选同意协议开关
    showPolicyModal: false, // 是否显示协议弹窗
    policyTitle: '',
    policyContent: ''
  },

  timer: null,

  onLoad() {
    // 显式启用“分享给朋友”和“分享到朋友圈”按钮
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    });

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
      isFormValid: false,
      isAgreed: false // 切换角色时重置协议勾选
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

  // 协议复选框勾选事件
  onAgreementChange(e) {
    const agreed = e.detail.value.includes('agree');
    this.setData({
      isAgreed: agreed
    }, () => {
      this.validateForm();
    });
  },

  // 弹出用户服务协议
  viewServiceAgreement() {
    this.setData({
      showPolicyModal: true,
      policyTitle: '用户服务协议',
      policyContent: serviceAgreementText
    });
  },

  // 弹出隐私政策
  viewPrivacyPolicy() {
    this.setData({
      showPolicyModal: true,
      policyTitle: '隐私政策条款',
      policyContent: privacyPolicyText
    });
  },

  // 关闭协议弹窗
  closePolicyModal() {
    this.setData({
      showPolicyModal: false
    });
  },

  // 在弹窗中一键阅读同意
  agreeAndClosePolicy() {
    this.setData({
      isAgreed: true,
      showPolicyModal: false
    }, () => {
      this.validateForm();
    });
  },

  // 阻止冒泡
  onModalInnerClick() {},

  // 1. 调用云函数获取短信验证码
  onSendVerifyCode() {
    if (!this.data.isPhoneValid || this.data.countdown > 0) return;

    // 获取验证码前，最好也确认勾选了协议，规范流程
    if (!this.data.isAgreed) {
      wx.showToast({
        title: '请勾选同意下方服务协议与隐私政策',
        icon: 'none',
        duration: 2000
      });
      return;
    }

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
            this.setData({
              sentCode: ''
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

  // 表单完整度校验 (强制检查勾选框)
  validateForm() {
    const { codeValue, phone, verifyCode, sentCode, isPhoneValid, enableSmsLogin, isAgreed } = this.data;
    
    // 1. 就诊单号/工号必须填写
    const isCodeOk = codeValue.trim().length > 0;
    
    // 2. 勾选协议框为强制前置条件 (不管是短信模式还是快捷登录模式都必须勾选以符合微信合规)
    if (!isAgreed) {
      this.setData({
        isFormValid: false
      });
      return;
    }

    // 如果未开启手机验证码登录，单号填写完毕+勾选框即可直接点亮登录按钮
    if (!enableSmsLogin) {
      this.setData({
        isFormValid: isCodeOk
      });
      return;
    }

    // 3. 手机号码格式必须正确
    const isPhoneOk = isPhoneValid && phone.length === 11;
    
    // 4. 验证码校验
    const isVerifyOk = verifyCode.trim().length >= 4 && (sentCode === '' || verifyCode === sentCode);

    this.setData({
      isFormValid: isCodeOk && isPhoneOk && isVerifyOk
    });
  },

  // 2. 安全登录：调用云函数在服务器进行验证码强匹配与单号检验
  onWechatLogin() {
    // 双重检查防绕过
    if (!this.data.isAgreed) {
      wx.showToast({
        title: '请阅读并勾选同意《用户服务协议》与《隐私政策》',
        icon: 'none',
        duration: 2000
      });
      return;
    }

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
  },

  onShareAppMessage() {
    return {
      title: '浦东中医院少儿推拿服务预约',
      path: '/pages/login/login'
    };
  },

  onShareTimeline() {
    return {
      title: '浦东新区中医医院少儿推拿中心预约',
      query: ''
    };
  }
})
