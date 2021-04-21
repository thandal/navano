global.browser = require("webextension-polyfill")
import { Wallet } from "./Wallet.js"
import { checksumAccount } from "./utils/services.js"
import * as DOMPurify from "dompurify"

function startExtension() {
  let deepLinkPopUp = false
  let wallet = new Wallet()
  wallet.init()
  chrome.runtime.onConnect.addListener(async port => {
    if (port.name === "popupController") {
      wallet.openPopup(port)
      port.onDisconnect.addListener(async port => {
        wallet.openWalletView = false
      })
    }

//    if (port.name === "contentControl") {
//      port.onMessage.addListener(async msg => {
//        try {
//          let parseMsg = JSON.stringify(msg)
//          let contentData = JSON.parse(DOMPurify.sanitize(parseMsg))
//          if (
//            checksumAccount(contentData.address) &&
//            /^\d+$/.test(contentData.amount)
//          ) {
//            if (!wallet.locked) {
//              wallet.setDeepLinkData(contentData.amount, contentData.address)
//              await chrome.windows.getCurrent(async function(win) {
//                let top = win.top + 90
//                let left = win.left + win.width - 330
//                deepLinkPopUp = window.open(
//                  "deeplinkSend/index.html",
//                  "Deeplink",
//                  "height=460,width=310,top=" +
//                    top +
//                    ",left=" +
//                    left +
//                    "status=yes,toolbar=no,menubar=no,location=no"
//                )
//
//                // Auto-close when onblur
//                deepLinkPopUp.onblur = function() {
//                  this.close()
//                }
//              })
//            }
//
//            if (wallet.locked) {
//              window.alert("Please unlock (or create) your navano wallet")
//            }
//          }
//        } catch (e) {
//          return console.log("Error contentControl:", e)
//        }
//      })
//    }
//
//    if (port.name === "deeplinkController") {
//      port.onMessage.addListener(async msg => {
//        try {
//          let parseMsg = JSON.stringify(msg)
//          let contentData = JSON.parse(DOMPurify.sanitize(parseMsg))
//
//          if (contentData.action === "close") {
//            deepLinkPopUp.close()
//          }
//
//          if (contentData.action === "setFields") {
//            wallet.openDeepView = true
//            let setFieldData = {
//              amount: wallet.deeplinkData.MNANO,
//              to: wallet.deeplinkData.to
//            }
//            port.postMessage({
//              action: "setFields",
//              data: setFieldData
//            })
//          }
//
//          if (contentData.action === "deepSend") {
//            wallet.deepSend(port, contentData.data)
//          }
//        } catch (e) {
//          return console.log("Error deeplinkController:", e)
//        }
//      })
//
//      port.onDisconnect.addListener(async port => {
//        wallet.openDeepView = false
//      })
//    }
  });
  chrome.runtime.onMessageExternal.addListener(
    function(request, sender, sendResponse) {
      //if (sender.url == blocklistedWebsite)
      //  return;  // don't allow this web page access
      console.log('onMessageExternal', request);
      console.dir(request);
      if (request.action === 'signMessage') {
        if (wallet.locked) {
          window.alert("Please unlock (or create) your Navano wallet")
          sendResponse({error : "locked"});
        } else if (window.confirm("Do you want to use your private key to sign the message '" + request.message + "'")) {
          const signature = wallet.signMessage(request.message);
          if (signature === "locked") {
            sendResponse({error : "locked"});
          } else {
            sendResponse({"signature" : signature});
          }
        }
      }
      if (request.action === 'getAddress') {
        if (wallet.locked) {
          window.alert("Please unlock (or create) your Navano wallet")
          sendResponse({error : "locked"});
        } else {
          sendResponse({"address" : wallet.account.address});
        }
      }
    });
}

startExtension()
