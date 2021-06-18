# NAVANO
Navano is a Nano featherweight-wallet browser extension, derived from [VANO](https://github.com/marekhoeven/VANO). Nano is a fast & fee-less currency secured by a decentralised network. The Navano wallet stores all sensitive data locally (encrypted) and never communicates it to a server. 

Navano resuscitates basic capabilities of sending and receiving nano, as well the new ability to sign messages and to set the RPC and websocket urls.

**Navano is still in beta, *do not* store large amounts of nano on this wallet!**

![Dashboard](https://github.com/thandal/navano/blob/master/dashboard.png)

## How to use the javascript API

Similar to MetaMask, Navano uses injection to provide access to "window.nano" in all web pages. The API currently only supports two calls:
```
window.nano.getAddress()
window.nano.signMessage("some message")
```


## How to run the extension locally

1. Download as ZIP and UNZIP into a folder
2. Open a terminal and 'cd' into the folder
3. Run:
```bash
$ npm install
$ (optional) npm audit fix 
$ npm run build
```

4. Open Chrome/Brave and enter as URL: 'chrome://extensions/' 
5. In the right-top corner toggle 'Developer mode'
6. In the left-top corner click 'Load unpacked'
7. Select the **dist**-folder inside your unzipped folder
8. Navano is now installed locally (don't remove the unzipped folder, otherwise the extension won't run anymore).

**:warning: WARNING: Please save your seed somewhere safe! If you uninstall/remove the extension, your imported seed is gone and has to be imported again**

## Some special commands for development:

#### `npm run build` 

Build the extension into `dist` folder for **production**.

#### `npm run build:dev` 

Build the extension into `dist` folder for **development**.

#### `npm run watch`

Watch for modifications then run `npm run build`.

#### `npm run watch:dev`

Watch for modifications then run `npm run build:dev`.

It also enable [Hot Module Reloading](https://webpack.js.org/concepts/hot-module-replacement), thanks to [webpack-chrome-extension-reloader](https://github.com/rubenspgcavalcante/webpack-chrome-extension-reloader) plugin. 

Keep in mind that HMR only works for your **background** entry.

#### `npm run build-zip`

Build a zip file following this format `<name>-v<version>.zip`, by reading `name` and `version` from `manifest.json` file.
Zip file is located in `dist-zip` folder.

## Acknowledgements

First, thanks to marekhoeven and the VANO repo!  If you like what they've made and/or are feeling generous, you can donate to the creator of VANO at:
`xrb_1xrhezmywgmq3n13d5rdnntubdkafi8qnxjcmwj6wqhwis8go84m18639tue`
