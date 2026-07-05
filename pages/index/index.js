// pages/index/index.js
const db = require('../../utils/db.js');
let envConfig = { REMINDER_TEMPLATE_ID: '' };
try {
  envConfig = require('../../env.js');
} catch (e) {
  console.warn('提示: 未找到 env.js，将使用云端默认配置模板ID');
}

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
  },

  // 3. 点击消息推送测试按钮，唤起订阅授权并调用云开发函数下发推送
  // 微信安全策略限制：wx.requestSubscribeMessage 必须在用户点击事件的同步执行流中触发，不能包在异步回调（如云函数返回或 wx.showModal 确定按钮）内部，否则会被拒绝唤起弹窗。
  triggerTestPush() {
    const templateId = envConfig.REMINDER_TEMPLATE_ID;
    if (!templateId) {
      wx.showModal({
        title: '提示',
        content: '未能在 env.js 中配置 REMINDER_TEMPLATE_ID，请先配置再点击测试。',
        showCancel: false
      });
      return;
    }

    // 同步首要调用：直接唤起官方弹窗
    wx.requestSubscribeMessage({
      tmplIds: [templateId],
      success: (subRes) => {
        console.log('订阅授权结果:', subRes);
        if (subRes[templateId] === 'accept') {
          this.executeTestPush(templateId);
        } else {
          wx.showModal({
            title: '授权被拒',
            content: '您拒绝了消息订阅授权，无法发送推送。请重新点击并选择“允许”以进行测试。',
            showCancel: false
          });
        }
      },
      fail: (subErr) => {
        console.error('订阅消息授权异常:', subErr);
        wx.showModal({
          title: '授权失败',
          content: '小程序唤起订阅弹窗失败：' + JSON.stringify(subErr),
          showCancel: false
        });
      }
    });
  },

  // 4. 执行实际的推送云函数调用，如失败则在回调中拉取模板进行诊断展示
  executeTestPush(templateId) {
    wx.showLoading({ title: '正在推送...' });
    wx.cloud.callFunction({
      name: 'bookingService',
      data: {
        action: 'sendTestPush',
        data: { templateId }
      },
      success: (res) => {
        wx.hideLoading();
        console.log('测试推送云函数返回:', res);
        if (res.result && res.result.success) {
          wx.showModal({
            title: '推送成功',
            content: '订阅消息已下发！请在微信服务通知中查看。\n云端日志：' + JSON.stringify(res.result),
            showCancel: false,
            confirmColor: '#0d9488'
          });
        } else {
          // 如果校验失败（比如 47003 键名不符），此时在回调中拉取模板格式方便开发者一目了然比对
          wx.showLoading({ title: '正在诊断模板字段...' });
          wx.cloud.callFunction({
            name: 'bookingService',
            data: {
              action: 'getTemplateDetails'
            },
            success: (detailRes) => {
              wx.hideLoading();
              let diagMsg = '';
              if (detailRes.result && detailRes.result.success && detailRes.result.data) {
                const list = detailRes.result.data;
                const match = Array.isArray(list) ? list.find(t => t.priTmplId === templateId) : null;
                if (match) {
                  diagMsg = `\n\n【智能诊断】您微信后台配置的模板内容为：\n${match.content}\n\n当前代码中发送的字段为：thing1(姓名), time2(时间), thing3(地点), thing4(提示)。\n\n对比可见您缺少的 ${res.result.errMsg.match(/thing\d+|character_string\d+|time\d+|date\d+/i) || '某些'} 字段在微信官方定义中。请点击确定对照修改。`;
                } else {
                  // 如果未匹配到当前 ID，打印小程序后台拥有的全部模板定义以供参考
                  const allTmplsStr = Array.isArray(list) 
                    ? list.map(t => `【${t.title}】\nID: ${t.priTmplId}\n内容: ${t.content.replace(/\n/g, ' ')}`).join('\n\n')
                    : JSON.stringify(list);
                  diagMsg = `\n\n【智能诊断】在您小程序的可用模板列表中未匹配到当前 ID。您小程序的全部可用模板如下，请核对 ID 是否配置正确：\n\n${allTmplsStr}`;
                }
              }
              wx.showModal({
                title: '推送失败',
                content: `云端推送校验未通过：${(res.result && res.result.errMsg) || '未知错误'}${diagMsg}`,
                showCancel: false
              });
            },
            fail: () => {
              wx.hideLoading();
              wx.showModal({
                title: '推送失败',
                content: `云端推送校验未通过：${(res.result && res.result.errMsg) || '未知错误'}\n(获取模板结构失败)`,
                showCancel: false
              });
            }
          });
        }
      },
      fail: (err) => {
        wx.hideLoading();
        console.error('测试推送网络异常:', err);
        wx.showModal({
          title: '网络异常',
          content: '云函数调用网络异常，请重试：' + JSON.stringify(err),
          showCancel: false
        });
      }
    });
  }
})
