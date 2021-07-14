import * as util from "./utils/services.js"
import { BehaviorSubject } from "rxjs"
import { BigNumber } from "bignumber.js"
import "./pow/nano-webgl-pow.js"
import * as startThreads from "./pow/startThreads.js"
import * as DOMPurify from "dompurify"
import { block, wallet, tools } from "nanocurrency-web"

//const DEFAULT_API_URL = "https://mynano.ninja/api/node"
//const DEFAULT_RPC_URL = "http://nano.dais.one:17076"
const DEFAULT_RPC_URL = "http://localhost:17076"

//const DEFAULT_WS_URL = "wss://ws.mynano.ninja"
//const DEFAULT_WS_URL = "ws://nano.dais.one:17078"
const DEFAULT_WS_URL = "ws://localhost:17078"

export class Wallet {
  constructor() {
    this.port = false
    this.locked = true
    this.isViewProcessing = false
    this.balance = new BigNumber(0)

    this.rpcURL = ""
    this.wsURL = ""
    this.socket = { ws: null, connected: false }
    this.newTransactions$ = new BehaviorSubject(null)
    this.isSending = false
    this.isChangingRep = false
    this.keepAliveSet = false
    this.offline = true
    this.reconnectTimeout = 5 * 1000
    this.keepaliveTimeout = 30 * 1000

    this.signature = ""

    this.isProcessing = false
    this.successfulBlocks = []
    this.sendHash = ""
    this.confirmSend = false
  }

  // BACKGROUND.JS STARTUP & OPENVIEW FUNCTIONS
  // ==================================================================
  async init() {
    let encryptedSeed = (await util.getLocalStorageItem("encryptedSeed")) || false
    this.page = encryptedSeed ? "locked" : "welcome"
    if (encryptedSeed) {
      chrome.browserAction.setIcon({ path: "/icons/icon_128_locked.png" })
    }

    this.rpcURL = (await util.getLocalStorageItem("rpcURL")) || DEFAULT_RPC_URL
    this.wsURL = (await util.getLocalStorageItem("wsURL")) || DEFAULT_WS_URL

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
    this.toPage(this.page)
  }

  // WALLET SETUP; IMPORT, DELETE, LOCK, ETC.
  // ==================================================================
  async setupWallet(seed) {
    if (!/[0-9A-Fa-f]{128}/g.test(seed)) return
    let w = wallet.fromSeed(seed);
    this.account = w.accounts[0];

    this.workPool = (await util.getLocalStorageItem("work")) || false // {work, hash} from frontier

    this.subscribeTransactions()
    this.forcedLock = false
    this.locked = false
    this.toPage("dashboard")
    this.connect()
  }

  // RPC CALLS
  // ==================================================================
  async getAccountInfo() {
    console.log('getAccountInfo ...');
    let request = await this.sendAPIRequest({
        action: "account_info",
        account: this.account.address,
        representative: 'true',
        pending: 'true',
      });

    if (!request.ok) {
      console.log('request not ok')
      console.dir(request);
      connectionProblem();
      return
    }

    if (request.response.error)
      console.log("getAccountInfo error", request.response.error);

    if (request.response.error == "Account not found") {
      console.log(request.response.error);
      this.offline = false
      this.checkOffline()
      return
    }

    const data = request.response;
    this.balance = new BigNumber(data.balance)
    this.frontier = data.frontier
    this.representative = data.representative
    console.dir('getAccountInfo data', data);

    this.checkIcon()
    if (["import", "locked"].includes(this.page)) this.toPage("dashboard")
    this.getNewWorkPool()
    this.offline = false
    this.updateView()
    this.checkOffline()
    this.reconnectTimeout = 5 * 1000
  }

  async getAccountHistory() {
    let request = await this.sendAPIRequest({
        action: "account_history",
        account: this.account.address,
        count: "-1",
      });

    if (!request.ok) {
      connectionProblem();
      return;
    }

    if (request.response.error)
      console.log("getAccountHistory error", request.response.error);

    if (request.response.error == "Account not found") {
      this.offline = false;
      this.checkOffline();
      return
    }

    const data = request.response;
    this.history = data.history

    this.checkIcon()
    if (["import", "locked"].includes(this.page)) this.toPage("dashboard")
    this.getNewWorkPool()
    this.offline = false
    this.updateView()
    this.checkOffline()
    this.reconnectTimeout = 5 * 1000
  }

  async getAccountPending() {
    let request = await this.sendAPIRequest({
        action: "accounts_pending",
        accounts: [this.account.address],
        count: "-1",
        include_only_confirmed: "true",
        source: "true"
      });

    if (!request.ok) {
      connectionProblem();
      return;
    }

    if (request.response.error)
      console.log("getAccountPending error", request.response.error);

    if (request.response.error == "Account not found") {
      this.offline = false;
      this.checkOffline();
      return
    }

    const data = request.response;
    this.pendingBlocks = []
    if (this.account.address in data.blocks) {
      const pending = data.blocks[this.account.address];
      for (const block in pending) {
        this.pendingBlocks.push({
          amount: pending[block].amount,
          account: pending[block].source,
          hash: block
        })
      }
    }

    this.checkIcon()
    if (["import", "locked"].includes(this.page)) this.toPage("dashboard")
    this.getNewWorkPool()
    this.offline = false
    this.updateView()
    this.checkOffline()
    this.reconnectTimeout = 5 * 1000
  }

  // WEBSOCKET STUFF
  // ==================================================================
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

  connectionProblem() {
    this.offline = true
    this.checkOffline()
    this.socket.ws.onclose = msg => {}
    this.socket.ws.onerror = msg => {}
    this.socket.ws.close()
    delete this.socket.ws
    this.socket.connected = false
    setTimeout(() => this.attemptReconnect(), this.reconnectTimeout)
  }

  setConnection(data) {
    this.rpcURL = data.rpcURL;
    this.wsURL = data.wsURL;
    this.connect();
  }

  connect() {
    if (this.forcedLock) {
      return
    }
    delete this.socket.ws
    const ws = new WebSocket(this.wsURL)
    this.socket.ws = ws
    ws.onopen = msg => {
      this.socket.connected = true
      const confirmation_subscription = JSON.stringify({
        action: 'subscribe',
        topic: "confirmation"
      })
      ws.send(confirmation_subscription)

      if (!this.keepaliveSet) {
        this.keepAlive()
      }
      // Get the current state from the RPC *after* the websocket is set up.
      this.getAccountInfo()
      this.getAccountHistory()
      this.getAccountPending()
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
        let data = JSON.parse(msg.data)
        console.log('socket onmessage:', data);
        if (data.topic === 'confirmation') {
          this.newTransactions$.next(data.message);
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
      this.socket.ws.send(JSON.stringify({ alive: 'ping' }));
    }
    setTimeout(() => { this.keepAlive() }, this.keepaliveTimeout)
  }

  subscribeTransactions() {
    this.newTransactions$.subscribe(async data => {
      if (!data) return
      if (!data.block) return
      let account = data.account;
      let subtype = data.block.subtype;
      let link = data.block.link_as_account;
      if (subtype === 'send' &&
          account !== this.account.address &&
          link === this.account.address) {
        // This is a pending transfer TO this account.
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
            "New pending deposit of " + data.amount + " raw",
          priority: 2,
          silent: false
        }

        var timestamp = new Date().getTime()
        var id = "NewPending" + timestamp
        chrome.notifications.create(id, notification_options, function(id) {})
      }

      if (subtype === 'send' &&
          account === this.account.address &&
          link !== this.account.address) {
        // This is a transfer FROM this account.
        this.frontier = data.hash;
        this.balance = new BigNumber(data.block.balance);
        this.history.unshift({
          amount: data.amount,
          account: data.block.link_as_account,
          hash: data.hash,
          type: "send"
        })
        this.updateView()
      }

      if (subtype === 'receive' && account === this.account.address) {
        // This is a confirmed transfer TO this account (receive).
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
    if (!hash || hash === "0000000000000000000000000000000000000000000000000000000000000000") {
      console.log('New account!?', this.account);
      hashWork = this.account.publicKey;
    }

    console.log('hashWork:', hashWork);

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
      let gotWorkResponse = await this.sendAPIRequest({
        action: "work_generate",
        hash: hashWork
      });
      if (gotWorkResponse.ok) {
        this.isGenerating = false
        this.updateView()
        return [gotWorkResponse.response.work, gotWorkResponse.response.hash] // [work, hash]
      }
    }

    // If server-side work generation went wrong
    console.log("Using local work...");

    let localwork = false
    if (this.isWebGL2Supported() && this.hasDedicatedGPU()) {
      console.log("Using WEBGL")
      localwork = await util.getResponseFromAwait(this.webgl2POW(hashWork))
    } else {
      console.log("Using wasmPOW")
      localwork = await util.getResponseFromAwait(this.wasmPOW(hashWork))
    }
    console.dir('localwork', localwork);

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
    const work = (await this.getWork(this.frontier, /*useServer=*/true, /*checkPool=*/false)) || false
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

  checkSend(data) {
    let amount = new BigNumber(util.mnanoToRaw(data.amount));
    let to = data.to
    let errorMessage = false
    if (amount.e < 0) errorMessage = "Your nano-unit is too small to send"
    if (amount.isNaN()) errorMessage = "Amount is not a valid number"
    if (amount.isLessThanOrEqualTo(0))
      errorMessage = "You can't send zero or negative NANO"
    if (/^\d+\.\d+$/.test(amount.toString()))
      errorMessage = "Cannot send smaller than raw"
    if (amount.isGreaterThan(this.balance))
      errorMessage = "Not enough Mnano in this wallet"
    if (!tools.validateAddress(to)) errorMessage = "Invalid address"
    if (to === this.account.address) errorMessage = "Can't send to yourself"
    if (this.isViewProcessing)
      errorMessage = "Still processing pendingblocks..."
    if (
      this.frontier === "0000000000000000000000000000000000000000000000000000000000000000"
    ) {
      errorMessage = "This account has nothing received yet"
    }
    if (
      this.isSending ||
      this.isChangingRep ||
      this.isGenerating
    ) {
      errorMessage = "Cooling down... try again in a few seconds"
    }
    if (errorMessage) {
      this.sendToView("errorMessage", errorMessage)
      return false
    }

    this.confirmSend = true
    this.updateView()
    return true
  }

  async send(data) {
    // Checks should have been run during confirmation, but run 'em again!
    if (!this.checkSend(data)) return

    this.isSending = true
    this.isGenerating = true  // remove?
    this.updateView()

    const work = (await this.getWork(this.frontier, true, true)) || false
    if (!work) {
      console.log("Error generating PoW")
      this.resetConfirm()
      this.toPage("failed")
      return
    }

    let block = this.newSendBlock(data, work[0])
    let request = await this.processBlock(block);
    if (!request.ok) {
      console.log("Send error", request)
      this.resetConfirm()
      this.toPage("failed")
    } else if (request.response.hash) {
      setTimeout(() => {
        this.sendHash = request.response.hash
        this.toPage("success")
        this.frontier = request.response.hash
        this.getNewWorkPool()
      }, 500);
      // timeOut against spam  [I think this is to prevent users from spamming?]
      setTimeout(() => {
        this.isSending = false
        this.confirmSend = false
      }, 5000);
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
    if (this.successfulBlocks.find(b => b.hash == nextBlock.hash)) {
      console.log('processPending trying again....');
      return setTimeout(() => this.processPending(), 1500)
    }

    console.dir('this.frontier', this.frontier)

    const work = (await this.getWork(this.frontier, true, true)) || false
    if (!work) {
      console.log("Error generating PoW")
      this.isViewProcessing = false
      this.isProcessing = false
      this.updateView()
      return
    }
    console.log('nextBlock', nextBlock)
    console.log('work', work[0])

    let block = this.newReceiveBlock(nextBlock, work[0])
    let request = await this.processBlock(block);
    console.log('processPending.request', request);
    if (!request.ok) {
      console.log("Receive error", request)
      this.isProcessing = false
      this.isViewProcessing = false
      this.updateView()
    } else if (request.response.hash) {
      if (this.successfulBlocks.length >= 15) {
        this.successfulBlocks.shift()
      }
      this.successfulBlocks.push(nextBlock.hash)

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
        this.frontier = request.response.hash
        this.getNewWorkPool()
      } else {
        // [Auto-process the next one... maybe should be a user choice?]
        setTimeout(() => this.processPending(), 1500)
      }
    }
  }

  async changeRepresentative(data) {
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
    if (!tools.validateAddress(newRep)) {
      this.sendToView("errorMessage", "Not a valid address")
      return
    }
    if (
      this.frontier ===
      "0000000000000000000000000000000000000000000000000000000000000000"
    ) {
      this.sendToView("errorMessage", "No open blocks yet")
      return
    }

    this.isChangingRep = true
    const work = (await this.getWork(this.frontier, true, true)) || false
    if (!work) {
      console.log("Error generating PoW")
      this.isChangingRep = false
      this.sendToView("errorMessage", "Something went wrong, try again")
      return
    }

    let block = this.newChangeBlock(newRep, work[0])
    let request = await this.processBlock(block);
    if (!request.ok) {
      console.log("Change error", request)
      this.isChangingRep = false
      this.sendToView("errorMessage", "Something went wrong, try again")
      this.updateView()
    } else if (request.response.hash) {
      this.frontier = response.hash
      this.sendToView("changedRep", newRep)
      this.getNewWorkPool()
      // timeOut against spam  [I think this is to prevent users from spamming?]
      setTimeout(() => {
        this.isChangingRep = false
      }, 5000)
    }
  }

  newChangeBlock(newRep, hasWork) {
    const data = {
      // Your current balance in raw nano.
      walletBalanceRaw: this.balance,
      // Your address
      toAddress: this.account.address,
      // The new representative
      representativeAddress: newRep,
      // Frontier from account info
      frontier: this.frontier,
      // Generate the work server-side or with a DPOW service
      work: hasWork,
    }
    const signedBlock = block.representative(data, this.account.privateKey);
    return signedBlock;
  }

  newReceiveBlock(blockinfo, hasWork) {
    const data = {
      // Your current balance in raw nano.
      walletBalanceRaw: this.balance,
      // Your address
      toAddress: this.account.address,
      // Representative from account info
      representativeAddress: this.representative,
      // Frontier from account info
      frontier: this.frontier,
      // From the pending transaction
      transactionHash: blockinfo.hash,
      // From the pending transaction in RAW
      amountRaw: blockinfo.amount,
      // Generate the work server-side or with a DPOW service
      work: hasWork,
    }
    console.dir('newReceiveBlock data', data);
    console.log('newReceiveBlock data', data);
    const signedBlock = block.receive(data, this.account.privateKey);
    return signedBlock;
  }

  newSendBlock(blockinfo, hasWork) {
    const data = {
      // Your current balance in raw nano.
      walletBalanceRaw: this.balance,
      // Your address
      fromAddress: this.account.address,
      // The address to send to
      toAddress: blockinfo.to,
      // Representative from account info
      representativeAddress: this.representative,
      // Frontier from account info
      frontier: this.frontier,
      // From the pending transaction in RAW
      amountRaw: new BigNumber(util.mnanoToRaw(blockinfo.amount)),
      // Generate the work server-side or with a DPOW service
      work: hasWork,
    }
    const signedBlock = block.send(data, this.account.privateKey);
    return signedBlock;
  }

  // Signing
  // ==================================================================

  signMessage(message) {
    let signature = this.locked ? "locked" : tools.sign(this.account.privateKey, message);
    return signature;
  }
  
  sign(data) {
    this.signature = signMessage(data.message);
    this.updateView()
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
        if (action === "import") this.importSeed(data)
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
        if (action === "changeRepresentative") this.changeRepresentative(data)
        if (action === "removeWallet") this.removeWallet()
        if (action === "setConnection") this.setConnection(data)
      }
    } catch (e) {
      return console.log("Error actionFromWalletView", e)
    }
  }

  checkOffline() {
    if (this.openPopup) {
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
      "backup",
      "changepassword",
      "connection",
      "create",
      "dashboard",
      "delete",
      "failed",
      "import",
      "locked",
      "receive",
      "representative",
      "send",
      "sign",
      "success",
      "transactions",
    ]

    let validPage = allowed.includes(to) ? to : "welcome"
    this.page = validPage
    this.sendToView("toPage", this.page)
  }

  async unlock(pw) {
    let encryptedSeed = (await util.getLocalStorageItem("encryptedSeed")) || false
    if (!encryptedSeed) return this.toPage("welcome")
    try {
      let seed = util.decryptString(encryptedSeed, pw)
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
    this.sendHash = ""
    this.confirmSend = false
    this.keepAliveSet = false
    this.successfulBlocks = []
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

  async importSeed(data) {
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

  updateView() {
    // Assemble history and pending blocks.
    let transactions = []
    if (this.pendingBlocks) {
      this.pendingBlocks.forEach(element => {
        let block = {
          type: "pending",
          amount: util.rawToMnano(element.amount).toString(),
          account: element.account,
          hash: element.hash
        }
        transactions.push(block)
      })
    }
    if (this.history) {
      this.history.forEach(element => {
        let block = {
          type: element.type,
          amount: util.rawToMnano(element.amount).toString(),
          account: element.account,
          hash: element.hash
        }
        transactions.push(block)
      })
    }

    let prep_balance = '--';
    let full_balance = '--';
    if (!this.offline) {
      full_balance = util.rawToMnano(this.balance).toString();
      prep_balance = full_balance.toString().slice(0, 8)
      if (prep_balance === "0") {
        prep_balance = "0.00"
      }
    }

    let info = {
      balance: prep_balance,
      total_pending: this.pendingBlocks ? this.pendingBlocks.length : 0,
      transactions,
      full_balance,
      frontier: this.frontier,
      publicAccount: this.account.address,
      isProcessing: this.isViewProcessing,
      representative: this.representative,
      sendHash: this.sendHash,
      isGenerating: this.isGenerating,
      isSending: this.isSending,
      isConfirm: this.confirmSend,
      signature: this.signature,
      offline: this.offline,
      rpcURL: this.rpcURL,
      wsURL: this.wsURL
    }
    this.sendToView("update", info)
  }

  // BASIC UTILITY FUNCTIONS
  // ==================================================================
  sendToView(action, data) {
    this.port.postMessage({ action, data })
  }

  sendAPIRequest(data) {
    return fetch(this.rpcURL, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data)})
    .then(response => response.json())
    .then(response => ({ok: response.error ? false : true, response}))
    .catch(error => Promise.resolve({ok: false, error}));
  }

  processBlock(block) {
    return this.sendAPIRequest({
      action: "process",
      'json_block': true,
      'watch_work': false,
      block:block
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
    if (this.offline) {
      chrome.browserAction.setIcon({ path: "/icons/icon_128_offline.png" })
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

  getPaddedBalance(rawAmount) {
    let paddedAmount = rawAmount.toString(16)
    while (paddedAmount.length < 32) paddedAmount = "0" + paddedAmount
    return paddedAmount.toUpperCase()
  }
}
