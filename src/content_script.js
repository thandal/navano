console.log('Navano content script started');

function injectScript(file_path) {
    var node = document.head || document.documentElement; 
    var script = document.createElement('script');
    script.setAttribute('type', 'text/javascript');
    script.setAttribute('src', file_path);
    node.insertBefore(script, node.children[0]);
    node.removeChild(script);
}

injectScript(chrome.extension.getURL('inject_script.js'));

window.addEventListener("message", function (event) {
    // Only accept messages from the current tab.
    if (event.source != window)
        return;
    // Filter on 'nano' event type.
    if (event.data.type && (event.data.type == 'nano') && typeof chrome.app.isInstalled !== 'undefined') {
        chrome.runtime.sendMessage({type:'nano', action:event.data.action, message:event.data.message}, response => {
          console.log('content_script: response:', response);
          window.postMessage({type:'nanoResponse', action:event.data.action, response});
        });
    }
}, false);
