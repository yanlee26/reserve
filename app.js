App({
  onLaunch() {
    // 展示本地存储能力
    const logs = wx.getStorageSync('logs') || [];
    logs.unshift(Date.now());
    wx.setStorageSync('logs', logs);

    // 安全导入环境配置 env.js
    let envConfig = { CLOUD_ENV_ID: '' };
    try {
      envConfig = require('./env.js');
    } catch (e) {
      console.warn('提示: 未找到 env.js，将使用默认环境。您可以复制 env.example.js 为 env.js 并配置您的云环境ID。');
    }

    // 初始化云开发能力
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      wx.cloud.init({
        env: envConfig.CLOUD_ENV_ID,
        traceUser: true,
      });
    }

    // 引入并初始化 Mock 数据库数据
    const db = require('./utils/db.js');
    db.initData();

    // 登录
    wx.login({
      success: res => {
        // 发送 res.code 到后台换取 openId, sessionKey, unionId
      }
    });
  },
  globalData: {
    userInfo: null,
    themeColor: '#0d9488'
  }
})
