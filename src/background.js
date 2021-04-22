global.browser = require("webextension-polyfill")
import { Wallet } from "./Wallet.js"
import { checksumAccount } from "./utils/services.js"
import * as DOMPurify from "dompurify"

function startExtension() {
  let wallet = new Wallet();
  wallet.init();

  chrome.runtime.onConnect.addListener(async port => {
    if (port.name === "popupController") {
      wallet.openPopup(port)
      port.onDisconnect.addListener(async port => {
        wallet.openWalletView = false
      })
    }
  });

  // TODO: find a more general replacement for messageExternal, because of the
  // manifest restriction.
  chrome.runtime.onMessageExternal.addListener(
    function(request, sender, sendResponse) {
      //if (sender.url == blocklistedWebsite)
      //  return;  // don't allow this web page access
      console.log('onMessageExternal', request);
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
