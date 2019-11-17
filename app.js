//app.js
let cf = require("/config.js");
let util = require("/utils/util.js");
let comm = require("/utils/comm.js");
let extConfig = tt.getExtConfigSync ? tt.getExtConfigSync() : {}
if (extConfig.ald_enable && extConfig.dev) {
  let san = require("/san.js");
}
App({
  onLaunch: function (options) {
    //调用API从本地缓存中获取数据
    //let logs = tt.getStorageSync('logs') || []
    //logs.unshift(Date.now())
    //tt.setStorageSync('logs', logs)
    let that = this;
    if (options.referrerInfo) {
      that.referrerInfo = JSON.stringify(options);
    }
    tt.setStorageSync('isHiden', true);

    //获取系统设备信息
    tt.getSystemInfo({
      success: function (res) {
        console.log(res);
        if (0 <= res.model.indexOf("iPhone X")) {

          that.globalData.isIPhoneX = true;
        }
      }
    })
  },
  // 获取用户信息
  getUserInfo: function (pageVm, options, cb) {
    let that = this;
    let app = getApp();
    let extConfig = tt.getExtConfigSync ? tt.getExtConfigSync() : {};
    let uid = cf.config.customPack ? cf.config.uid : extConfig.uid;
    if (!tt.getStorageSync('lastTokenTime')) {
      tt.removeStorageSync("cusmallToken");
    } else {
      let lastTokenTime = tt.getStorageSync('lastTokenTime');
      // token 默认两天后失效
      console.log(new Date().getTime() - lastTokenTime)
      if (new Date().getTime() - lastTokenTime > 2 * 24 * 60 * 60 * 1000) {
        tt.removeStorageSync("cusmallToken");
        tt.removeStorageSync("userInfo");
      }
    }
    console.log("生产环境域名(cf.config.pageDomain)", cf.config.pageDomain);
    that.getCusmallToken(pageVm, options).then(function () {
      // 定制处理
      if (cf.config.pageDomain && cf.config.pageDomain.indexOf("weijuju.com") != -1 && (uid == 13693 || uid == 37774)) {
        that.judgeEnterApplet();
      }
      //缓存用户信息、cusmallToken
      app.globalData.userInfo = tt.getStorageSync('userInfo');
      app.globalData.cusmallToken = tt.getStorageSync('cusmallToken');
      let promises = [];
      promises.push(that.queryUserIdentity());
      if (!tt.getStorageSync('mallSiteId') && !pageVm.data.isIndexPage) {
        promises.push(that.fetchMallSite());
      }
      Promise.all(promises).then(function (cbParams) {
        cb(app.globalData.userInfo, cbParams);
      });

    });
  },
  getCusmallToken: function (pageVm, options) {
    let that = this;
    let app = getApp();
    return new Promise(function (resolve, reject) {
      tt.checkSession({
        success: function (res) {
          if (tt.getStorageSync('userInfo') && tt.getStorageSync('cusmallToken')) {
            resolve();
          } else {
            getApp().ttLogin(pageVm).then(function () {
              resolve();
            });
          }
        },
        fail: function (err) {
          getApp().ttLogin(pageVm).then(function () {
            resolve();
          });
        }
      })
    });
  },
  ttLogin: function (pageVm) {
    let that = this;
    let app = getApp();

    return new Promise(function (resolve, reject) {
      //调用登录接口
      tt.login({
        force: false,
        success: function (res) {
          let wxCode = res.code;
          let submitData = {
            wxCode: wxCode,
            appletPlatform: 3,
            uid: cf.config.customPack ? cf.config.uid : extConfig.uid
          }
          // 兼容判断未登录头条账号
          console.log(pageVm);
          if (!wxCode) {
            tt.hideLoading();
            tt.showModal({
              title: '提示',
              showCancel: false,
              content: "请先登录今日头条账号",
              success(res) {
                if (res.confirm) {
                  pageVm.setData({
                    isShow: true
                  })

                } else if (res.cancel) {
                  console.log('cancel, cold')
                } else {
                  // what happend?
                }
              },

            });

            return false;

          }
          console.log(submitData)
          if (app.referrerInfo) {
            //submitData.extraData = app.referrerInfo
          }
          if (!pageVm.data.skipUserInfoOauth) {
            tt.getUserInfo({
              withCredentials: true,
              success: function (userInfoResult) {
                app.globalData.userInfo = userInfoResult.userInfo;
                console.log(userInfoResult)
                if (tt.getStorageSync("userInfo")) {
                  resolve();
                } else {
                  tt.setStorageSync("userInfo", userInfoResult.userInfo);
                  // 调用后台接口获取cusmallToken
                  if (userInfoResult.encryptedData) {
                    submitData.encryptedData = userInfoResult.encryptedData;
                    submitData.iv = userInfoResult.iv;
                  }
                  tt.request({
                    url: cf.config.pageDomain + '/applet/oauth/getCusmallToken',
                    data: submitData,
                    header: {
                      'content-type': 'application/json'
                    },
                    fail: function (data) {
                      console.error("后台接口获取cusmallToken失败", data);
                    },
                    success: function (res) {
                      console.log(res.data);
                      if (res.data.ret == 0) {
                        tt.setStorageSync('cusmallToken', res.data.model.cusmallToken);
                        tt.setStorageSync('lastTokenTime', new Date().getTime());
                        app.globalData.cusmallToken = tt.getStorageSync('cusmallToken');
                        resolve();
                      } else {
                        let errMsg = res.data.msg;
                        if (res.data.ret == -4000) {
                          errMsg = "请检查配置参数";
                        }
                        tt.showModal({
                          title: '获取授权信息异常',
                          showCancel: false,
                          content: errMsg
                        })
                        tt.hideLoading();
                      }
                    }
                  })
                }
              },
              fail: function (e) {
                console.log(e);
                tt.hideLoading();
              }
            });
          } else {
            tt.request({
              url: cf.config.pageDomain + '/applet/oauth/getCusmallToken',
              data: submitData,
              header: {
                'content-type': 'application/json'
              },
              fail: function (data) {
                console.error("后台接口获取cusmallToken失败", data);
              },
              success: function (res) {
                console.log(res.data);
                if (res.data.ret == 0) {
                  tt.setStorageSync('cusmallToken', res.data.model.cusmallToken);
                  tt.setStorageSync('lastTokenTime', new Date().getTime());
                  app.globalData.cusmallToken = tt.getStorageSync('cusmallToken');
                  var isOuthBaseInfo = res.data.model.isOuthBaseInfo;
                  if (isOuthBaseInfo && tt.getStorageSync("userInfo")) {
                    resolve();
                    return;
                  }
                  resolve();
                } else {
                  let errMsg = res.data.msg;
                  if (res.data.ret == -4000) {
                    errMsg = "请检查配置参数";
                  }
                  tt.showModal({
                    title: '获取授权信息异常',
                    showCancel: false,
                    content: errMsg
                  })
                  tt.hideLoading();
                }
              }
            })
          }






        },
        fail: function (res) {
          if (res.errCode == 202) {
            tt.showModal({
              title: '提示',
              showCancel: false,
              content: "请先登录今日头条"
            });
          }
          tt.hideLoading();
          console.error("tt login fail:" + JSON.stringify(res));
        }
      })
    })
  },

  // 无论从哪个子页面进入应用，启动时默认要获取站点首页数据
  fetchMallSite: function (hideLoading) {
    // if (tt.getStorageSync('mallSiteId')) {
    //   return Promise.resolve();
    // }
    return new Promise(function (resolve, reject) {
      console.log("Start fetchMallSite...");
      console.log("cf.config.pageDomain", cf.config.pageDomain);
      console.log("cusmallToken", tt.getStorageSync('cusmallToken'));
      let extConfig = tt.getExtConfigSync ? tt.getExtConfigSync() : {};
      let that = this;
      let app = getApp();
      if (!hideLoading) {
        // tt.showLoading({
        //   title: '加载中',
        // })
      }
      let submitData = {

        uid: cf.config.customPack ? cf.config.uid : extConfig.uid
      }
      if (app.globalData.previewuid) {
        submitData.uid = app.globalData.previewuid;
        console.info("加载预览店铺UID", submitData.uid);
      }
      if (app.globalData.shopuid) {
        submitData.uid = app.globalData.shopuid;
        console.info("加载多店铺UID", submitData.uid);
      }
      tt.request({
        url: cf.config.pageDomain + '/applet/mobile/mallSite/getMallSite',
        data: submitData,
        header: {
          'content-type': 'application/json'
        },
        fail: function (data) {
          console.error("后台接口getMallSite失败", data);
        },
        success: function (res) {
          console.log("Finish fetchMallSite...RES DATA", res);
          let mallSite = res.data.model.mallSite;
          // 处理账户到期
          if (res.data.model.expire) {
            tt.showModal({
              title: '套餐过期',
              showCancel: false,
              content: "免费体验期已结束，请升级套餐！"
            })
            tt.hideLoading();
            return;
          }
          // 判断是否免费用户
          if (res.data.model.isFree && !res.data.model.isoem && app.globalData.previewuid) {
            app.globalData.showHKTChatTips = true;
          }
          // 缓存OEM数据
          //res.data.model.isoem = true;
          //mallSite.copyright = "LCP Test";
          //res.data.model.oemconfig = { extend:"{\"mobileCopyright\":\"LCP TEST\"}"};
          if (res.data.model.isoem && mallSite.copyright) {
            app.globalData.isoem = true;
            app.globalData.oemconfig = res.data.model.oemconfig;

            if (app.globalData.oemconfig.extend) {
              app.globalData.oemconfig.extend = JSON.parse(app.globalData.oemconfig.extend);
              let reg = new RegExp("\\n", "g");
              let mobileCopyright = app.globalData.oemconfig.extend.mobileCopyright;
              if (mobileCopyright) {
                app.globalData.oemconfig.extend.mobileCopyright = mobileCopyright.replace(reg, "<br />")
              }
            }
            if (app.globalData.oemconfig.extend1) {
              app.globalData.oemconfig.extend1 = JSON.parse(app.globalData.oemconfig.extend1);
              let reg = new RegExp("\\n", "g");
              let mobileCopyright = app.globalData.oemconfig.extend1.mobileCopyright;
              if (null == app.globalData.oemconfig.extend) {
                app.globalData.oemconfig.extend = {};//#1 以防 配了手机底部版权 却没配官网oem
              }
              if (mobileCopyright) {
                app.globalData.oemconfig.extend.mobileCopyright = mobileCopyright.replace(reg, "<br />");//#1
              }
            }
          } else {
            app.globalData.isoem = false;
          }


          app.globalData.mallSite = mallSite;
          tt.setStorageSync('mallSiteId', mallSite.id);
          // 不必要缓存mallSite的decoration，提升性能
          let mallSiteCache = Object.assign({}, mallSite);
          mallSiteCache.decoration = {};
          tt.setStorageSync('mallSite', mallSiteCache);
          let decorationData = {};
          if (res.data.model.decoration) {
            decorationData = JSON.parse(res.data.model.decoration);
          } else if (mallSite.decoration) {
            decorationData = JSON.parse(mallSite.decoration);
          }
          app.globalData.bottomMenus = null;
          app.globalData.haveShopcart = false;
          app.globalData.haveContact = false;
          app.globalData.haveBgMusic = false;

          // 开始处理首页弹出蒙版
          let showOpeningModal = false;
          let headerData = decorationData.header_data;
          let modalData = decorationData.header_data.data;
          let lastShowTime = tt.getStorageSync('openingModalLastShowTime');
          let needShowModal = !lastShowTime && modalData;
          if (lastShowTime && modalData && modalData.ts && lastShowTime != modalData.ts) {
            needShowModal = true;
          }
          if (needShowModal) {
            if (modalData.isShowMask && modalData.img) {
              showOpeningModal = true;
              modalData.img = comm.specUrl(extConfig, cf.config.userImagePath, modalData.img, 1080)
              decorationData.header_data.data = util.convertItemLink(decorationData.header_data.data, { data: { app: app } });
              tt.setStorageSync('openingModalLastShowTime', modalData.ts || new Date().getTime());
            } else {
              showOpeningModal = false;
            }
          }
          if (showOpeningModal) {
            app.globalData.headerData = decorationData.header_data;
          }
          app.globalData.showOpeningModal = showOpeningModal;
          let titleName = encodeURIComponent(headerData.title);
          // 缓存底部菜单数据
          if (decorationData != null && decorationData.items != null) {
            for (let i = 0; i < decorationData.items.length; i++) {
              let item = decorationData.items[i];
              if (item.item_type == "takeawayWidget") {
                if (app.globalData.fromuid) {
                  tt.redirectTo({
                    url: '/pages/takeout/index?fromIndex=true&fromuid=' + app.globalData.fromuid + '&type=ta&shopuid=' + app.globalData.shopuid + (item.data.return_index == 1 ? "&returnIndex=1" : "") + "&titleName=" + titleName,
                  })
                } else {
                  tt.redirectTo({
                    url: '/pages/takeout/index?fromIndex=true' + (item.data.return_index == 1 ? "&type=ta&returnIndex=1" : "") + "&titleName=" + titleName,
                  })
                }
                return;
              } else if (item.item_type == "toStoreWidget") {
                if (app.globalData.fromuid) {
                  tt.navigateTo({
                    url: '/pages/takeout/index?type=tostore&fromIndex=true&fromuid=' + app.globalData.fromuid + '&shopuid=' + app.globalData.shopuid + (item.data.return_index == 1 ? "&returnIndex=1" : "") + "&titleName=" + titleName,
                  })
                } else {
                  tt.redirectTo({
                    url: '/pages/takeout/index?type=tostore&fromIndex=true' + (item.data.return_index == 1 ? "&returnIndex=1" : "") + "&titleName=" + titleName,
                  })
                }
                return;
              } else if (item.item_type == "bottomMenusWidget") {
                app.globalData.bottomMenus = item.data;
                console.log(app.globalData.bottomMenus)
              }
            }
          }
          resolve(res);
          //typeof cb == "function" && cb(app.globalData.userInfo, res);
          tt.hideLoading();
        }
      })
    });

  },
  queryUserIdentity: function (reload) {//获取当前用户信息
    let that = this;
    let app = getApp();
    if (!reload && app.globalData.myOpenid) {
      return Promise.resolve();
    }
    return new Promise(function (resolve, reject) {
      tt.request({
        url: cf.config.pageDomain + "/applet/mobile/distributor/queryUserIdentity",
        data: {
          cusmallToken: tt.getStorageSync('cusmallToken')
        },
        header: {
          'content-type': 'application/json'
        },
        success: function (res) {
          let data = res.data;
          if (data && 0 == data.ret) {
            app.globalData.isDistributor = data.model.userIdentityVo.isDistributor;
            app.globalData.isOpenDistribution = data.model.userIdentityVo.isOpenDistribution;
            app.globalData.myOpenid = data.model.userIdentityVo.openid;
            app.globalData.State = data.model.userIdentityVo.applyState;
            app.globalData.applyRemark = data.model.userIdentityVo.applyRemark;

            // 缓存颜色主题ID
            app.globalData.themeId = data.model.themeId || 1;
          }
        },
        fail: function () {
        },
        complete: function () {
          resolve();
        }
      });
    });

  },

  judgeEnterApplet: function () {//是否能进入小程序
    let that = this;
    let app = getApp();
    var pageVm = "";
    if (getCurrentPages().length > 0) {
      pageVm = getCurrentPages()[getCurrentPages().length - 1];
    }
    if (pageVm.route.indexOf("customization/apply") != -1) {
      return;
    }
    tt.request({
      url: cf.config.pageDomain + "/applet/mobile/member/judgeEnterApplet",
      data: {
        cusmallToken: tt.getStorageSync('cusmallToken')
      },
      header: {
        'content-type': 'application/json'
      },
      success: function (res) {
        let data = res.data;
        if (data && 0 == data.ret) {
          if (!data.model.isEnter) {
            let state = data.model.state;
            // if (!app.globalData.userInfo){
            //   app.globalData.userInfo = {};
            // }
            // app.globalData.userInfo.nickName = data.model.nickName;
            // app.globalData.userInfo.avatarUrl = data.model.headPic;
            if (state == 10) {
              tt.reLaunch({
                url: '/pages/customization/apply/apply',
              })
            } else if (state == 0) {
              tt.reLaunch({
                url: '/pages/customization/apply/applyResult?applyResult=success',
              })
            } else if (state == -1) {
              tt.reLaunch({
                url: '/pages/customization/apply/applyResult?applyResult=fail',
              })
            }
            app.globalData.hasRedirectApply = true;
          }
        }
      },
      fail: function () {
      },
      complete: function () {

      }
    });
  },
  globalData: {
    userInfo: null,
    cusmallToken: null
  },
  onHide: function () {
    tt.getBackgroundAudioManager().pause();
  }

})