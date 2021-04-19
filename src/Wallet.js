import * as util from "./utils/services.js"
import { BehaviorSubject } from "rxjs"
import { BigNumber } from "bignumber.js"
import axios from "axios"
import "./pow/nano-webgl-pow.js"
import * as startThreads from "./pow/startThreads.js"
import * as DOMPurify from "dompurify"
import { wallet, tools } from "nanocurrency-web"

//const WS_URL = "wss://socket.nanos.cc"
const WS_URL = "wss://ws.mynano.ninja"
//const WS_URL = "wss://localhost:17078"

//const API_URL = "https://proxy.nanos.cc/proxy"
//const API_URL = "https://vox.nanos.cc/api"
//const API_URL = "https://mynano.ninja/api/node"
const API_URL = "http://localhost:17076"

export class Wallet {
  constructor() {
    console.log("ZZZ WALLET CONSTRUCTOR")
    this.port = false
    this.locked = true
    this.openWalletView = false
    this.openDeepView = false
    this.isViewProcessing = false

    this.socket = { ws: null, connected: false }
    this.newTransactions$ = new BehaviorSubject(null)
    this.isSending = false
    this.isSigning = false
    this.isChangingRep = false
    this.isDeepSending = false
    this.keepAliveSet = false
    this.offline = true
    this.reconnectTimeout = 5 * 1000
    this.keepaliveTimeout = 30 * 1000

    this.isProcessing = false
    this.successfullBlocks = []
    this.sendHash = ""
    this.confirmSend = false
    this.deeplinkData = {} // amount in raw, mNANO, address
  }

  setDeepLinkData(amount, to) {
    this.deeplinkData = {
      raw: new BigNumber(amount),
      to: to,
      raw: amount
    }
  }

  resetDeepLink() {
    if (this.openDeepView) {
      this.sendToView("failure", "failure")
    }
    this.isDeepSending = false
  }

  async deepSend(port, data) {
    this.port = port

    if (this.offline) {
      if (this.openDeepView) {
        this.sendToView("errorMessage", "You are disconnected")
      }
      return
    }

    if (!data.confirmed) {
      this.checkSend(data)
      return
    }

    this.isDeepSending = true

    try {
      if (this.openDeepView) {
        this.sendToView("generating", "")
      }
      const work = (await this.getWork(this.frontier, true, true)) || false
      if (!work) {
        console.log("1/ Error generating PoW")
        this.resetDeepLink()
        return
      }

      let block = this.newSendBlock({ data }, work[0])
      this.pushBlock(block)
        .then(response => {
          if (response.hash) {
            setTimeout(() => {
              if (this.openDeepView) {
                this.sendToView("success", response.hash)
              }

              this.frontier = response.hash
              this.getNewWorkPool()
            }, 500)
            // timeOut against spam
            setTimeout(() => {
              this.isDeepSending = false
            }, 5000)
          } else {
            console.log("2/ Pushblock error", response)
            this.resetDeepLink()
            this.isDeepSending = false
          }
        })
        .catch(err => {
          console.log("2/ Pushblock error", err)
          this.resetDeepLink()
        })
    } catch (err) {
      console.log("3/ Sending error:", err)
      this.resetDeepLink()
    }
  }
  // BACKGROUND.JS STARTUP & OPENVIEW FUNCTIONS
  // ==================================================================
  async init() {
    console.log("ZZZ INIT")
    let encryptedSeed = (await util.getLocalStorageItem("encryptedSeed")) || false
    console.log("ZZZ encryptedSeed " + encryptedSeed)
    this.page = encryptedSeed ? "locked" : "welcome"
    if (encryptedSeed) {
      chrome.browserAction.setIcon({ path: "/icons/icon_128_locked.png" })
    }

    // Remove temporary LocalStorage-items if extension crashed/was offline for a long time
    util.clearLocalStorage([
      "generatedSeed",
      "inputSeed",
      "amount",
      "to_address"
    ])
  }

  async openPopup(port) {
    this.port = port
    this.port.onMessage.addListener(this.actionFromWalletView.bind(this))
    this.openWalletView = true
    this.toPage(this.page)
  }

  // WALLET SETUP; IMPORT, DELETE, LOCK, ETC.
  // ==================================================================
  async setupWallet(seed) {
    console.log("ZZZ setupWallet")
    if (!/[0-9A-Fa-f]{128}/g.test(seed)) return
    let w = wallet.fromSeed(seed);
    console.dir(w);
    this.account = w.accounts[0];
    console.dir(this.account)

    this.workPool = (await util.getLocalStorageItem("work")) || false // {work, hash} from frontier

    this.subscribeTransactions()
    this.forcedLock = false
    this.locked = false
    this.toPage("dashboard")
    this.connect()
  }

  async setupWalletInfo(data) {
    console.log("ZZZ setupWalletInfo")
    console.dir(data)
    this.balance = new BigNumber(data.balance)
    this.frontier = data.frontier
    this.representative = data.representative
    this.history = data.history
//    this.pendingBlocks = this.setPendingBlock(data.pending)
    this.hasChanged = false
  }

//  setPendingBlock(data) {
//    if (!Object.keys(data).length) return []
//    let result = []
//    for (var key in data) {
//      if (data.hasOwnProperty(key)) {
//        result.push({
//          amount: data[key].amount,
//          account: data[key].source,
//          hash: key
//        })
//      }
//    }
//    return result
//  }

  forceDisconnect() {
    this.forcedLock = true
    this.updateView()
    if (this.socket.connected && this.socket.ws) {
      this.socket.ws.onclose = msg => {}
      this.socket.ws.onerror = msg => {}
      this.socket.ws.close()
      delete this.socket.ws
      this.socket.connected = false
    } else {
      delete this.socket.ws
      this.socket = { ws: null, connected: false }
    }
  }

  async getWalletUpdate() {
    console.log("ZZZ getWalletUpdate")
    let requestAccountInformation = await util.getResponseFromAwait(
      this.sendAPIRequest({action: "account_info", account: this.account.address})
    );
    console.dir(requestAccountInformation)

    if (!requestAccountInformation.ok) {
      this.offline = true
      this.checkOffline()
      this.socket.ws.onclose = msg => {}
      this.socket.ws.onerror = msg => {}
      this.socket.ws.close()
      delete this.socket.ws
      this.socket.connected = false
      setTimeout(() => this.attemptReconnect(), this.reconnectTimeout)
      return
    }

    if (requestAccountInformation.data.data.error == "Account not found") {
      this.offline = false
      this.checkOffline()
      console.log("ZZZ Account not found!")
      return
    }

    this.setupWalletInfo(requestAccountInformation.data.data)
    this.checkIcon()
    if (["import", "locked"].includes(this.page)) this.toPage("dashboard")
    this.getNewWorkPool()
    this.offline = false
    this.updateView()
    this.checkOffline()
    this.reconnectTimeout = 5 * 1000
  }

  connect() {
    console.log("ZZZ CONNECT")
    if ((this.socket.connected && this.socket.ws) || this.forcedLock) {
      return
    }
    delete this.socket.ws
    const ws = new WebSocket(WS_URL)
    this.socket.ws = ws
    ws.onopen = msg => {
      this.socket.connected = true
      const start_event = JSON.stringify({
        event: "subscribe",
        data: this.account.address
      })

      ws.send(start_event)

      if (!this.keepaliveSet) {
        this.keepAlive()
      }

      this.getWalletUpdate()
    }

    ws.onerror = msg => {
      this.offline = true
      this.socket.connected = false
      this.checkOffline()
      console.log("Socket error")
    }

    ws.onclose = msg => {
      this.offline = true
      this.checkOffline()
      this.socket.connected = false
      console.log("Socket closed")
      setTimeout(() => this.attemptReconnect(), this.reconnectTimeout)
    }

    ws.onmessage = msg => {
      try {
        let event = JSON.parse(msg.data)
        let type = event.event
        let data = event.data

        if (type === "newTransaction") {
          this.newTransactions$.next(data)
        }
      } catch (err) {
        return false
      }
    }
  }

  attemptReconnect() {
    this.connect()
    if (this.reconnectTimeout < 30 * 1000) {
      this.reconnectTimeout += 5 * 1000 // Slowly increase the timeout up to 30 seconds
    }
  }

  keepAlive() {
    this.keepAliveSet = true
    if (this.socket.connected) {
      this.socket.ws.send(JSON.stringify({ alive: "keepAlive" }))
    }

    setTimeout(() => {
      this.keepAlive()
    }, this.keepaliveTimeout)
  }

  subscribeTransactions() {
    this.newTransactions$.subscribe(async data => {
      if (!data) return
      let isSend = data.is_send
      let account = data.account
      let link = data.block.link_as_account
      if (
        isSend &&
        account !== this.account.address &&
        link === this.account.address
      ) {
        // SEND SOMETHING TO ME
        this.pendingBlocks.unshift({
          amount: data.amount,
          account: account,
          hash: data.hash
        })

        this.checkIcon()
        this.updateView()

        const notification_options = {
          type: "basic",
          iconUrl: "./icons/icon_128.png",
          title: "Received nano!",
          message:
            "New pending deposit of " +
            data.amount +
            " raw",
          priority: 2,
          silent: false
        }

        var timestamp = new Date().getTime()
        var id = "NewPending" + timestamp
        chrome.notifications.create(id, notification_options, function(id) {})
      }

      if (
        isSend &&
        account === this.account.address &&
        link !== this.account.address 
      ) {
        // I SEND SOMETHING
        this.frontier = data.hash
        this.balance = new BigNumber(data.block.balance)

        this.history.unshift({
          amount: data.amount,
          account: data.block.link_as_account,
          hash: data.hash,
          type: "send"
        })
        this.updateView()
      }

      if (!isSend && account === this.account.address) {
        // RECEIVED TO ME!
        this.frontier = data.hash
        this.representative = data.block.representative
        if (
          !new BigNumber(data.block.balance).isEqualTo(
            new BigNumber(this.balance)
          )
        ) {
          // check if still in pendingBlocks otherwise add to history
          this.pendingBlocks.forEach((item, index) => {
            if (data.block.link === item.hash) {
              let amount = this.pendingBlocks[index].amount
              let from = this.pendingBlocks[index].account
              let hash = this.pendingBlocks[index].hash
              this.pendingBlocks.splice(index, 1)

              this.history.unshift({
                amount: amount,
                account: from,
                hash: hash,
                type: "receive"
              })
            }
          })
        }
        this.balance = new BigNumber(data.block.balance)

        this.checkIcon()
        this.updateView()
      }
    })
  }

  // GENERATING WORK & WORKPOOL:
  // ==================================================================
  async getWork(hash, useServer = false, checkPool = true) {
    // Always returns an array: [work, hash]
    let hashWork = hash
    // Special case if new account: sign the publicKey.
    if (hash === "0000000000000000000000000000000000000000000000000000000000000000") {
      hashWork = this.account.publicKey;
    }

    if (checkPool) {
      // Check for local cached work
      if (this.workPool.hash === hashWork && this.workPool.work) {
        let work = this.workPool.work
        this.workPool = false
        return [work, hashWork]
      }

      this.isGenerating = true
      this.updateView()
    }

    if (useServer) {
      let gotWorkResponse = await util.getResponseFromAwait(
        this.sendAPIRequest("generate_work", {
          account: this.account.address,
          hash: hashWork
        })
      )
      if (gotWorkResponse.ok) {
        this.isGenerating = false
        this.updateView()
        return [gotWorkResponse.data.data.work, gotWorkResponse.data.data.hash] // [work, hash]
      }
    }

    // If server-side work generation went wrong
    console.log("Using local work...")

    let localwork = false
    if (this.isWebGL2Supported() && this.hasDedicatedGPU()) {
      console.log("Using WEBGL")
      localwork = await util.getResponseFromAwait(this.webgl2POW(hashWork))
    } else {
      console.log("Using wasmPOW")
      localwork = await util.getResponseFromAwait(this.wasmPOW(hashWork))
    }

    if (localwork.ok) {
      this.isGenerating = false
      this.updateView()
      return [localwork.data.work, hashWork]
    }
    console.log("Error Generating PoW in getWork")
    // If PoW failed
    this.isGenerating = false
    this.updateView()
    return false
  }

  async getNewWorkPool() {
    let checkHash = this.frontier
    if (checkHash === "0000000000000000000000000000000000000000000000000000000000000000") {
      checkHash = this.account.publicKey;
    }

    if (this.workPool.hash === checkHash && this.workPool.work) return
    if (!this.workPool || typeof this.workPool !== "object") this.workPool = {}
    const work = (await this.getWork(this.frontier, true, false)) || false
    if (!work) {
      console.log("1/ Error generating background-PoW")
      return
    }

    this.workPool = { work: work[0], hash: work[1] }
    await util.setLocalStorageItem("work", this.workPool)
  }

  // INTERACTING WITH THE NANO NETWORK:
  // SIGNING BLOCKS, SEND, RECEIVE, CHANGE ETC.
  // ==================================================================
  resetConfirm() {
    this.isSending = false
    this.confirmSend = false
    this.updateView()
  }

  async send(raw_data) {
    if (!this.checkSend(raw_data)) return

    this.isSending = true
    this.isGenerating = true
    this.updateView()

    try {
      const work = (await this.getWork(this.frontier, true, true)) || false
      if (!work) {
        console.log("1/ Error generating PoW")
        this.resetConfirm()
        this.toPage("failed")
        return
      }

      let block = this.newSendBlock({ data: raw_data }, work[0])
      this.pushBlock(block)
        .then(response => {
          if (response.hash) {
            setTimeout(() => {
              this.sendHash = response.hash
              this.toPage("success")
              this.frontier = response.hash
              this.getNewWorkPool()
            }, 500)
            // timeOut against spam
            setTimeout(() => {
              this.isSending = false
              this.confirmSend = false
            }, 5000)
          } else {
            console.log("2/ Pushblock error", response)
            this.resetConfirm()
            this.toPage("failed")
          }
        })
        .catch(err => {
          console.log("2/ Pushblock error", err)
          this.resetConfirm()
          this.toPage("failed")
        })
    } catch (err) {
      console.log("3/ Sending error:", err)
      this.resetConfirm()
      this.toPage("failed")
    }
  }

  async processPending() {
    if (this.isProcessing || this.locked || !this.pendingBlocks.length) {
      this.isViewProcessing = false
      this.isProcessing = false
      this.updateView()
      return
    }

    this.isProcessing = true
    const nextBlock = this.pendingBlocks[0]
    if (this.successfullBlocks.find(b => b.hash == nextBlock.hash)) {
      return setTimeout(() => this.processPending(), 1500)
    }

    const work = (await this.getWork(this.frontier, true, true)) || false

    if (!work) {
      console.log("1/ Error generating PoW")
      this.isViewProcessing = false
      this.isProcessing = false
      this.updateView()
      return
    }

    let block = this.newOpenBlock(nextBlock, work[0])
    this.pushBlock(block)
      .then(response => {
        if (response.hash) {
          if (this.successfullBlocks.length >= 15)
            this.successfullBlocks.shift()
          this.successfullBlocks.push(nextBlock.hash)

          let to_history = this.pendingBlocks.shift()
          this.history.unshift({
            type: "receive",
            amount: to_history.amount,
            account: to_history.account,
            hash: to_history.hash
          })

          this.isProcessing = false
          if (!this.pendingBlocks.length) {
            this.isViewProcessing = false
            this.updateView()
            this.frontier = response.hash
            this.getNewWorkPool()
          } else {
            setTimeout(() => this.processPending(), 1500)
          }
        } else {
          console.log("2/ Error on server-side node")
          this.isViewProcessing = false
          this.isProcessing = false
          this.updateView()
          return
        }
      })
      .catch(err => {
        console.log("3/ Error on server-side node")
        this.isProcessing = false
        this.isViewProcessing = false
        this.updateView()
        return
      })
  }

  async changeRepresentative(new_rep) {
    if (this.isChangingRep) {
      this.sendToView("errorMessage", "Changing too often, wait a few seconds")
      return
    }
    this.isChangingRep = true
    try {
      const work = (await this.getWork(this.frontier, true, true)) || false
      if (!work) {
        this.isChangingRep = false
        this.sendToView("errorMessage", "Something went wrong, try again")
        this.updateView()
        return
      }

      let block = this.newChangeBlock(new_rep, work[0])
      this.pushBlock(block)
        .then(response => {
          if (response.hash) {
            this.frontier = response.hash
            this.sendToView("changedRep", new_rep)
            this.getNewWorkPool()

            setTimeout(() => {
              this.isChangingRep = false
            }, 5000)
          } else {
            this.isChangingRep = false
            this.sendToView("errorMessage", "Something went wrong, try again")
            this.updateView()
            return
          }
        })
        .catch(err => {
          this.isChangingRep = false
          this.sendToView("errorMessage", "Something went wrong, try again")
          this.updateView()
          return
        })
    } catch (err) {
      this.isChangingRep = false
      this.sendToView("errorMessage", "Something went wrong, try again")
      this.updateView()
      return
    }
  }

  newChangeBlock(newRep, hasWork) {
    console.log('NOT IMPLEMENTED');
    //let newBalancePadded = this.getPaddedBalance(this.balance)
    //let link =
    //  "0000000000000000000000000000000000000000000000000000000000000000";
    //let signature = util.signChangeBlock(
    //  this.account.address,
    //  this.frontier,
    //  newRep,
    //  newBalancePadded,
    //  link,
    //  this.account.privateKey
    //);

    //let changeBlock = {
    //  type: "state",
    //  account: this.account.address,
    //  previous: this.frontier, //hex format
    //  representative: newRep,
    //  destination: false,
    //  balance: this.balance.toString(10),
    //  work: hasWork,
    //  signature: signature,
    //  linkHEX: link,
    //  link: link
    //};

    //return changeBlock
  }

  newOpenBlock(blockinfo, hasWork) {
    console.log('NOT IMPLEMENTED');
    //let amount = new BigNumber(blockinfo.amount)
    //let newBalance = this.balance.plus(new BigNumber(amount))
    //let newBalancePadded = this.getPaddedBalance(newBalance)

    //let signature = util.signOpenBlock(
    //  this.account.address,
    //  this.frontier,
    //  blockinfo.hash,
    //  newBalancePadded,
    //  this.representative,
    //  this.account.privateKey
    //)

    //return {
    //  type: "state",
    //  account: this.account.address,
    //  previous: this.frontier, //hex format
    //  representative: this.representative,
    //  destination: this.account.address,
    //  balance: newBalance,
    //  work: hasWork,
    //  signature: signature,
    //  linkHEX: blockinfo.hash,
    //  link: blockinfo.hash
    //}
  }

  newSendBlock(blockinfo, hasWork) {
    console.log('NOT IMPLEMENTED');
    //let amount = util.mnanoToRaw(new BigNumber(blockinfo.data.amount))
    //let to = blockinfo.data.to
    //let newBalance = new BigNumber(this.balance).minus(new BigNumber(amount))
    //let newBalancePadded = this.getPaddedBalance(newBalance)
    //let signature = util.signSendBlock(
    //  this.account.address,
    //  this.frontier,
    //  this.representative,
    //  newBalancePadded,
    //  to,
    //  this.account.privateKey
    //)

    //return {
    //  type: "state",
    //  account: this.account.address,
    //  previous: this.frontier, //hex format
    //  representative: this.representative,
    //  destination: to,
    //  balance: newBalance.toString(),
    //  work: hasWork,
    //  signature: signature,
    //  linkHEX: util.getAccountPublicKey(to),
    //  link: to
    //}
  }

  checkChangeRep(data) {
    let newRep = data.trim()
    if (this.isChangingRep) {
      this.sendToView("errorMessage", "Changing too often, wait a few seconds")
      return
    }
    if (newRep === "") {
      this.sendToView("errorMessage", "Empty address-field")
      return
    }
    if (this.isProcessing || this.isSending) {
      this.sendToView("errorMessage", "Currently processing pending..")
      return
    }
    if (newRep === this.representative) {
      this.sendToView("errorMessage", "Already voting for this reprentative")
      return
    }
//    if (!util.checksumAccount(newRep)) {
//      this.sendToView("errorMessage", "Not a valid address")
//      return
//    }
    if (
      this.frontier ===
      "0000000000000000000000000000000000000000000000000000000000000000"
    ) {
      this.sendToView("errorMessage", "No open blocks yet")
      return
    }

    this.changeRepresentative(data)
  }
  // TODO: CHANGE BLOCK
  
  sign(data) {
    const message = data.message
    console.log("signing " + message);
    const signature = tools.sign(this.account.privateKey, message);
    console.log("signature " + signature);
  }

  // FUNCTIONS TO INTERACT WITH THE WALLET VIEW
  // ==================================================================
  actionFromWalletView(msg) {
    try {
      let parseMsg = JSON.stringify(msg)
      let popupMsg = JSON.parse(DOMPurify.sanitize(parseMsg))

      if (this.port.name === "popupController") {
        const action = popupMsg.action
        const data = popupMsg.data

        if (action === "toPage") this.toPage(data)
        if (action === "import") this.checkImport(data)
        if (action === "unlock") this.unlock(data)
        if (action === "lock") this.lock()
        if (action === "update") this.updateView()
        if (action === "isLocked") this.sendToView("isLocked", this.locked)
        if (action === "isOffline") this.checkOffline()
        if (action === "processPending") this.startProcessPending()
        if (action === "checkSend") this.checkSend(data)
        if (action === "confirmSend") this.send(data)
        if (action === "resetConfirm") this.resetConfirm(data)
        if (action === "sign") this.sign(data)
        if (action === "changeRepresentative") this.checkChangeRep(data)
        if (action === "removeWallet") this.removeWallet()
      }
    } catch (e) {
      return console.log("Error actionFromWalletView", e)
    }
  }

  checkOffline() {
    if (this.openDeepView || this.openPopup) {
      if (!this.locked) {
        this.sendToView("isOffline", this.offline)
        if (this.offline) {
          chrome.browserAction.setIcon({ path: "/icons/icon_128_offline.png" })
        } else {
          this.checkIcon()
        }
      } else {
        this.sendToView("isOffline", false)
      }
    }
  }

  startProcessPending() {
    if (this.isProcessing || this.isViewProcessing) {
      this.updateView()
      return console.log("Already processing")
    }
    if (this.pendingBlocks.length <= 0) {
      this.updateView()
      return console.log("Nothing to process")
    }
    if (this.isSending || this.isChangingRep) {
      this.sendToView("errorProcessing", "Already sending, try again")
      return console.log("Already sending something")
    }
    this.isViewProcessing = true
    this.updateView()
    this.processPending()
  }

  toPage(to) {
    const allowed = [
      "create",
      "import",
      "dashboard",
      "send",
      "receive",
      "success",
      "locked",
      "transactions",
      "failed",
      "delete",
      "representative",
      "backup",
      "changepassword",
      "sign"
    ]

    let validPage = allowed.includes(to) ? to : "welcome"
    this.page = validPage
    this.sendToView("toPage", this.page)
  }

  async unlock(pw) {
    console.log("ZZZ unlock")
    let encryptedSeed = (await util.getLocalStorageItem("encryptedSeed")) || false
    if (!encryptedSeed) return this.toPage("welcome")
    try {
      let seed = util.decryptString(encryptedSeed, pw)
      console.log("ZZZ unencrypted seed " + seed)

      if (!/[0-9A-Fa-f]{128}/g.test(seed) || pw.length < 2) {
        return this.sendToView("errorMessage", true)
      }
      this.setupWallet(seed)
    } catch (err) {
      return this.sendToView("errorMessage", true)
    }
  }

  async lock(toLocked = true) {
    this.forceDisconnect()
    this.offline = true
    this.locked = true
    this.newTransactions$ = new BehaviorSubject(null)
    this.reconnectTimeout = 5 * 1000
    this.keepaliveTimeout = 40 * 1000

    this.isProcessing = false
    this.isViewProcessing = false
    this.isSending = false
    this.isChangingRep = false
    this.successfullBlocks = []
    this.sendHash = ""
    this.confirmSend = false
    this.deeplinkData = {} // amount in raw, mNANO, address
    this.keepAliveSet = false
    this.successfullBlocks = []
    this.pendingBlocks = []
    this.history = []
    this.workPool = {}

    delete this.account
    delete this.account.address
    delete this.balance
    delete this.frontier
    delete this.representative

    if (toLocked) {
      chrome.browserAction.setIcon({ path: "/icons/icon_128_locked.png" })
      await this.toPage("locked")
      this.updateView()
    }
  }

  async removeWallet() {
    chrome.browserAction.setIcon({ path: "/icons/icon_128.png" })
    this.lock(false)
    this.toPage("welcome")
    this.updateView()
    await chrome.storage.local.remove(
      ["encryptedSeed", "generatedSeed", "inputSeed", "amount", "to_address", "seed", "work"],
      function() {}
    )
  }

  async checkImport(data) {
    let seed = data.seed
    let pw = data.pw
    let re_pw = data.re_pw
    let errorMessage = false

    if (pw !== re_pw) errorMessage = "re_pw"
    if (re_pw.length < 2) errorMessage = "re_pw"
    if (pw.length < 2) errorMessage = "pw"
    if (!/[0-9A-Fa-f]{128}/g.test(seed)) errorMessage = "seed"
    if (errorMessage) {
      this.sendToView("errorMessage", errorMessage)
      return
    }

    await util.setLocalStorageItem("encryptedSeed", util.encryptString(seed, pw));

    this.setupWallet(seed)
  }

  checkSend(data) {
    let amount = new BigNumber(util.mnanoToRaw(data.amount))
    let to = data.to
    let errorMessage = false
    if (amount.e < 0) errorMessage = "Your nano-unit is too small to send"
    if (amount.isNaN()) errorMessage = "Amount is not a valid number"
    if (amount.isLessThanOrEqualTo(0))
      errorMessage = "You can't send zero or negative NANO"
    if (/^\d+\.\d+$/.test(amount.toString()))
      errorMessage = "Cannot send smaller than raw"
    if (amount.isGreaterThan(this.balance))
      errorMessage = "Not enough NANO in this wallet"
//    if (!util.checksumAccount(to)) errorMessage = "Invalid address"
    if (to === this.account.address) errorMessage = "Can't send to yourself"
    if (this.isViewProcessing)
      errorMessage = "Still processing pendingblocks..."
    if (
      this.frontier ===
      "0000000000000000000000000000000000000000000000000000000000000000"
    ) {
      errorMessage = "This account has nothing received yet"
    }
    if (
      this.isSending ||
      this.isChangingRep ||
      this.isDeepSending ||
      this.isGenerating
    ) {
      errorMessage = "Cooling down... try again in a few seconds"
    }
    if (errorMessage) {
      this.sendToView("errorMessage", errorMessage)
      return false
    }

    if (this.openDeepView) {
      this.sendToView("confirm", true)
    } else {
      this.confirmSend = true
      this.updateView()
      return true
    }
  }

  updateView() {
    let result = []
    if (!this.offline) {
      if (this.pendingBlocks) {
        console.log('PENDING');
        console.dir(pending);
        this.pendingBlocks.forEach(element => {
          let block = {
            type: "pending",
            amount: element.amount, //util.rawToMnano(element.amount).toString(),
            account: element.account,
            hash: element.hash
          }
          result.push(block)
        })
      }

      if (this.history) {
        console.log('HISTORY');
        console.dir(history);
        this.history.forEach(element => {
          let block = {
            type: element.type,
            amount: element.amount, //util.rawToMnano(element.amount).toString(),
            account: element.account,
            hash: element.hash
          }
          result.push(block)
        })
      }

      let full_balance = this.balance; // util.rawToMnano(this.balance).toString()
      let prep_balance = full_balance.toString().slice(0, 8)
      if (prep_balance === "0") {
        prep_balance = "00.00"
      }
      let info = {
        balance: prep_balance,
        total_pending: this.pendingBlocks ? this.pendingBlocks.length : 0,
        transactions: result,
        full_balance,
        frontier: this.frontier,
        publicAccount: this.account.address,
        isProcessing: this.isViewProcessing,
        representative: this.representative,
        sendHash: this.sendHash,
        isGenerating: this.isGenerating,
        isSending: this.isSending,
        isConfirm: this.confirmSend,
        isDeepSending: this.isDeepSending,
        offline: this.offline
      }
      this.sendToView("update", info)
    } else {
      this.sendToView("update", {
        balance: "--",
        total_pending: 0,
        transactions: [],
        full_balance: "--",
        frontier: "",
        publicAccount: "--",
        isProcessing: this.isViewProcessing,
        representative: "--",
        sendHash: "",
        isGenerating: this.isGenerating,
        isSending: this.isSending,
        isConfirm: this.confirmSend,
        isDeepSending: this.isDeepSending,
        offline: true
      })
    }
  }

  // BASIC UTILITY FUNCTIONS
  // ==================================================================
  sendToView(action, data) {
    if (this.openWalletView || this.openDeepView)
      this.port.postMessage({ action, data })
  }

  sendAPIRequest(data) {
    return new Promise(function(resolved, rejected) {
      axios({
        method: "post",
        url: API_URL,
        data: data,
      })
        .then(result => {
          resolved(result)
        })
        .catch(function(err) {
          rejected(err)
        })
    })
  }

  checkIcon() {
    if (this.locked) {
      chrome.browserAction.setIcon({ path: "/icons/icon_128_locked.png" })
      return
    }
    if (this.pendingBlocks && this.pendingBlocks.length > 0) {
      chrome.browserAction.setIcon({ path: "/icons/icon_128_pending.png" })
      return
    }

    chrome.browserAction.setIcon({ path: "/icons/icon_128.png" })
  }

  async webgl2POW(hash) {
    return new Promise((resolved, rejected) => {
      try {
        window.NanoWebglPow(hash, work => {
          resolved({ work, hash })
        })
      } catch (err) {
        console.log("webgl2POW():", err)
        rejected(err)
      }
    })
  }

  async wasmPOW(hash) {
    return new Promise((resolved, rejected) => {
      try {
        const workers = startThreads.pow_initiate(undefined, "")
        startThreads.pow_callback(
          workers,
          hash,
          () => {},
          work => {
            resolved({ work, hash })
          }
        )
      } catch (err) {
        console.log("wasmPOW():", err)
        rejected(err)
      }
    })
  }

  isWebGL2Supported() {
    const gl = document.createElement("canvas").getContext("webgl2")
    if (!gl) {
      console.log("WEBGL not supported")
      return false
    }

    try {
      let offscreen = new OffscreenCanvas(100, 100)
    } catch (e) {
      console.log("WEBGL not supported")
      return false
    }
    return true
  }

  hasDedicatedGPU() {
    var canvas = document.createElement("canvas")
    var gl
    var debugInfo
    var vendor
    var renderer

    try {
      gl = canvas.getContext("webgl2")
      if (gl) {
        debugInfo = gl.getExtension("WEBGL_debug_renderer_info")
        vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
        renderer = gl
          .getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
          .toLowerCase()
      }
      console.log("GPU is:", renderer)
      if (renderer.includes("nvidia")) return true
      if (renderer.includes("amd")) return true
      if (renderer.includes("intel")) return false
      return false
    } catch (e) {
      return false
    }
  }

  pushBlock(data) {
    return new Promise((resolved, rejected) => {
      this.sendAPIRequest({action: "process", data:data})
        .then(response => {
          resolved(response.data.result)
        })
        .catch(err => {
          console.log("Receive ERROR", err)
          rejected()
        })
    })
  }

  getPaddedBalance(rawAmount) {
    let paddedAmount = rawAmount.toString(16)
    while (paddedAmount.length < 32) paddedAmount = "0" + paddedAmount
    return paddedAmount.toUpperCase()
  }
}
