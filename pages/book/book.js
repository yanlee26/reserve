// pages/book/book.js
const db = require('../../utils/db.js');

let envConfig = { REMINDER_TEMPLATE_ID: '' };
try {
  envConfig = require('../../env.js');
} catch (e) {
  console.warn('提示: 未找到 env.js，将无法唤起订阅消息弹窗');
}

Page({
  data: {
    editId: '',
    dateList: [],
    selectedDate: '',
    selectedDateShort: '',
    selectedDateStr: '',
    morningSlots: [],
    afternoonSlots: [],
    selectedTime: '',
    name: '',
    phone: '',
    remarkOptions: ['生长发育', '夜啼', '消化不良/大便干燥/厌食', '感冒流鼻涕', '其它'],
    selectedRemarkOpt: '',
    customRemarks: '',
    occupiedSlots: [],
    isSubmitEnabled: false,
    submitLoading: false
  },

  loadOccupiedSlots() {
    return db.getOccupiedSlots().then(list => {
      this.setData({
        occupiedSlots: list
      });
    }).catch(err => {
      console.error('获取占用时段失败:', err);
    });
  },

  onLoad(options) {
    this.initDatePicker();

    // 先拉取已被占用的时段，再处理回填或生成网格
    this.loadOccupiedSlots().then(() => {
      // 判断是否是修改预约模式
      if (options && options.editId) {
        wx.showLoading({
          title: '加载中...',
          mask: true
        });

        db.getBookingById(options.editId).then(booking => {
          wx.hideLoading();
          if (booking) {
            // 查找对应日期的格式化字符
            const matchedDate = this.data.dateList.find(d => d.date === booking.date);
            
            let selectedRemarkOpt = '';
            let customRemarks = '';
            if (booking.remarks) {
              if (this.data.remarkOptions.includes(booking.remarks)) {
                selectedRemarkOpt = booking.remarks;
              } else {
                selectedRemarkOpt = '其它';
                customRemarks = booking.remarks;
              }
            }

            this.setData({
              editId: options.editId,
              selectedDate: booking.date,
              selectedDateShort: booking.date.slice(5),
              selectedDateStr: matchedDate ? matchedDate.dateStr : booking.date,
              selectedTime: booking.time,
              name: booking.patientName,
              phone: booking.patientPhone,
              selectedRemarkOpt,
              customRemarks
            }, () => {
              this.generateTimeSlots();
              // 回填完后再做一次校验
              this.validateForm();
            });
            
            wx.setNavigationBarTitle({
              title: '修改预约单'
            });
          } else {
            wx.showToast({
              title: '预约单未找到',
              icon: 'none'
            });
          }
        }).catch(err => {
          wx.hideLoading();
          console.error('加载预约详情失败:', err);
          wx.showToast({
            title: '加载失败',
            icon: 'error'
          });
        });
      } else {
        // 预约新增模式，回填上次的联系人
        const lastContact = wx.getStorageSync('LAST_CONTACT_INFO');
        if (lastContact) {
          this.setData({
            name: lastContact.name || '',
            phone: lastContact.phone || ''
          });
        }
        this.generateTimeSlots();
      }
    });
  },

  // 1. 初始化未来 15 天的日期
  initDatePicker() {
    const days = [];
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const now = new Date();

    for (let i = 0; i < 15; i++) {
      const targetDate = new Date();
      targetDate.setDate(now.getDate() + i);

      const year = targetDate.getFullYear();
      const month = String(targetDate.getMonth() + 1).padStart(2, '0');
      const dateVal = String(targetDate.getDate()).padStart(2, '0');
      
      const dateStr = `${year}-${month}-${dateVal}`;
      const dateShort = `${month}-${dateVal}`;
      
      let dayName = weekdays[targetDate.getDay()];
      if (i === 0) dayName = '今天';
      if (i === 1) dayName = '明天';
      if (i === 2) dayName = '后天';

      days.push({
        date: dateStr,
        dateShort: dateShort,
        dayName: dayName,
        dateStr: `${year}年${month}月${dateVal}日 (${dayName})`
      });
    }

    this.setData({
      dateList: days,
      selectedDate: days[0].date,
      selectedDateShort: days[0].dateShort,
      selectedDateStr: days[0].dateStr
    });
  },

  // 2. 生成 20 分钟间隔的时间段，并根据当前时间过滤
  generateTimeSlots() {
    // 上午: 8:00 - 12:00
    const morning = [
      '08:00', '08:20', '08:40', '09:00', '09:20', '09:40',
      '10:00', '10:20', '10:40', '11:00', '11:20', '11:40'
    ];
    // 下午: 13:00 - 17:00
    const afternoon = [
      '13:00', '13:20', '13:40', '14:00', '14:20', '14:40',
      '15:00', '15:20', '15:40', '16:00', '16:20', '16:40'
    ];

    const now = new Date();
    const currentHour = now.getHours();
    const currentMin = now.getMinutes();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const filterPassedSlots = (slots) => {
      return slots.map(timeStr => {
        // 1. 校验是否是今天已过去的时段
        let isPast = false;
        if (this.data.selectedDate === todayStr) {
          const [hour, min] = timeStr.split(':').map(Number);
          const slotTimeInMinutes = hour * 60 + min;
          const currentTimeInMinutes = currentHour * 60 + currentMin + 20; // 提前20分钟预约
          isPast = slotTimeInMinutes < currentTimeInMinutes;
        }

        // 2. 校验该日期时段是否已被其他人预约占满
        const isOccupied = this.data.occupiedSlots.some(item => 
          item.date === this.data.selectedDate && 
          item.time === timeStr && 
          item.id !== this.data.editId
        );

        return {
          time: timeStr,
          disabled: isPast || isOccupied
        };
      });
    };

    this.setData({
      morningSlots: filterPassedSlots(morning),
      afternoonSlots: filterPassedSlots(afternoon)
    });
  },

  selectDate(e) {
    const { date, datestr } = e.currentTarget.dataset;
    this.setData({
      selectedDate: date,
      selectedDateShort: date.slice(5),
      selectedDateStr: datestr,
      selectedTime: '' // 切换日期重置选中的时间
    }, () => {
      this.generateTimeSlots();
      this.validateForm();
    });
  },

  selectTime(e) {
    const { time, disabled } = e.currentTarget.dataset;
    if (disabled) return;

    this.setData({
      selectedTime: time
    }, () => {
      this.validateForm();
    });
  },

  onInputName(e) {
    this.setData({
      name: e.detail.value.trim()
    }, () => {
      this.validateForm();
    });
  },

  onInputPhone(e) {
    this.setData({
      phone: e.detail.value.trim()
    }, () => {
      this.validateForm();
    });
  },

  selectRemarkOpt(e) {
    const opt = e.currentTarget.dataset.opt;
    const newOpt = this.data.selectedRemarkOpt === opt ? '' : opt;
    this.setData({
      selectedRemarkOpt: newOpt
    }, () => {
      this.validateForm();
    });
  },

  onInputCustomRemarks(e) {
    this.setData({
      customRemarks: e.detail.value
    }, () => {
      this.validateForm();
    });
  },

  // 表单校验
  validateForm() {
    const { selectedDate, selectedTime, name, phone, selectedRemarkOpt, customRemarks } = this.data;
    const isPhoneValid = /^1[3-9]\d{9}$/.test(phone);
    
    let isRemarksValid = true;
    if (selectedRemarkOpt === '其它') {
      isRemarksValid = customRemarks.trim().length > 0;
    }

    const isValid = selectedDate && selectedTime && name.length > 0 && isPhoneValid && isRemarksValid;
    
    this.setData({
      isSubmitEnabled: isValid
    });
  },

  // 提交预约
  submitBooking() {
    if (!this.data.isSubmitEnabled || this.data.submitLoading) return;

    const { selectedDate, selectedTime, name, phone } = this.data;

    // Notion 需求: 确认弹窗
    wx.showModal({
      title: '确认提交预约',
      content: `预约时间: ${selectedDate} ${selectedTime}\n儿童姓名: ${name}\n联系电话: ${phone}\n\n是否确认提交此预约单？`,
      success: (res) => {
        if (res.confirm) {
          const templateId = envConfig.REMINDER_TEMPLATE_ID;
          if (templateId) {
            wx.requestSubscribeMessage({
              tmplIds: [templateId],
              success: (subRes) => {
                console.log('订阅消息授权成功:', subRes);
              },
              fail: (subErr) => {
                console.warn('订阅消息授权异常:', subErr);
              },
              complete: () => {
                this.executeSubmit();
              }
            });
          } else {
            this.executeSubmit();
          }
        }
      }
    });
  },

  executeSubmit() {
    this.setData({ submitLoading: true });
    const { editId, selectedDate, selectedTime, name, phone, selectedRemarkOpt, customRemarks } = this.data;

    // 决定最终提交的 remarks 内容
    let remarks = '';
    if (selectedRemarkOpt === '其它') {
      remarks = customRemarks.trim();
    } else if (selectedRemarkOpt) {
      remarks = selectedRemarkOpt;
    }

    // 缓存最新填写的联系人
    wx.setStorageSync('LAST_CONTACT_INFO', { name, phone });

    const diagnosisId = wx.getStorageSync('DIAGNOSIS_ID') || 'TCM-999';

    const templateId = envConfig.REMINDER_TEMPLATE_ID || '';

    // 统一处理异步提交逻辑
    let submitPromise;
    if (editId) {
      // 修改模式
      submitPromise = db.updateBooking(editId, selectedDate, selectedTime, name, phone, remarks, templateId);
    } else {
      // 新增模式
      const bookingData = {
        diagnosisId,
        date: selectedDate,
        time: selectedTime,
        patientName: name,
        patientPhone: phone,
        remarks: remarks,
        templateId: templateId
      };
      submitPromise = db.addBooking(bookingData);
    }

    submitPromise.then(res => {
      this.setData({ submitLoading: false });
      
      if (res && res.success) {
        wx.showToast({
          title: editId ? '修改成功' : '预约成功',
          icon: 'success',
          duration: 1500
        });

        setTimeout(() => {
          // 返回主页并自动加载列表
          wx.redirectTo({
            url: '/pages/index/index'
          });
        }, 1500);
      } else {
        // 服务端返回校验失败（如同人同日冲突、就诊单限额超限等）
        wx.showModal({
          title: '预约提交失败',
          content: (res && res.errMsg) || '未知错误，请重试',
          showCancel: false,
          confirmColor: '#0d9488'
        });
      }
    }).catch(err => {
      this.setData({ submitLoading: false });
      console.error('预约提交异常:', err);
      wx.showModal({
        title: '提示',
        content: '网络异常，提交失败，请重试',
        showCancel: false
      });
    });
  }
})
