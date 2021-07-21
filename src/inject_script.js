console.log('Navano injected script started');

// TODO: use proper Promise structures, instead of grungy wait loops.

let signature = '';
let waitingForSignature = false;
let address = '';
let waitingForAddress = false;

window.nano = {
  version: '0.0.1',
  getAddress: async function() {
    if (waitingForAddress) {
      console.log('Already waiting for address, skipping');
      return;
    }
    console.log('inject_script: nano.getAddress');
    window.postMessage({type:'nano', action:'getAddress'});
    waitingForAddress = true;
    while (waitingForAddress) {
      await new Promise(r => setTimeout(r, 100));  // sleep
    }
    let tmp_address = address;
    address = '';
    return tmp_address;
  },
  signMessage: async function(message) {
    if (waitingForSignature) {
      console.log('Already waiting for signature, skipping');
      return;
    }
    console.log('inject_script: nano.signMessage', message);
    window.postMessage({type:'nano', action:'signMessage', message});
    waitingForSignature = true;
    while (waitingForSignature) {
      await new Promise(r => setTimeout(r, 100));  // sleep
    }
    let tmp_signature = signature;
    signature = '';
    return tmp_signature;
  }
};

window.addEventListener('message', function (event) {
    console.log('inject_script: message event:', event);
    // Filter on 'nanoResponse' event type.
    if (event.data.type && (event.data.type == 'nanoResponse') && typeof chrome.app.isInstalled !== 'undefined') {
      if (waitingForSignature && event.data.action && event.data.action == 'signMessage') {
        signature = event.data.response.signature;
        waitingForSignature = false;
      }
      if (waitingForAddress && event.data.action && event.data.action == 'getAddress') {
        address = event.data.response.address;
        waitingForAddress = false;
      }
    }
}, false);
