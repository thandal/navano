<template>
  <div class="connection">
    <div class="header">
      <div class="headerText no-hl container">
	<h1>Connection</h1>
      </div>
    </div>
    <div class="address">
      RPC URL:
      <input type="text"
        placeholder="https://..."
        v-model="rpcURL"
      ></input>
    </div>
    <div class="address">
      Websocket URL:
      <input type="text"
        placeholder="wss://..."
        v-model="wsURL"
      ></input>
    </div>

    <button class="send no-hl" @click="setConnection()"> Set </button>
  </div>
</template>

<script>
import navigation from "../navigation.js";
export default {
  name: "connection",
  data() {
    return {
      rpcURL: "",
      wsURL: "",
    };
  },

  async created() {
    this.$bus.postMessage({ action: "update" });
  },

  methods: {
    bgMessages(msg) {
      if (msg.action === "update") {
        this.rpcURL = msg.data.rpcURL;
        this.wsURL = msg.data.wsURL;
      }
    },
    setConnection() {
      this.$bus.postMessage({
          action: "setConnection",
          data: { rpcURL: this.rpcURL, wsURL: this.wsURL }
        });
    }
  },
  beforeMount() {
    this.$bus.onMessage.addListener(this.bgMessages);
    this.$bus.postMessage({
      action: "update"
    });
  },
  mixins: [navigation]
};
</script>

<style lang="scss" scoped>
.wallet {
  background-color: #f7f7f7 !important;
  height: 100%;
}

.header {
  height: 123px;
}

input[type="number"]::-webkit-inner-spin-button,
input[type="number"]::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

button {
  width: 100%;
  font-family: "RubikMedium";
  position: absolute;
  bottom: 0;
  height: 50px;
  border: none;
  font-size: 15px;
  line-height: 21px;
  color: #ffffff;
  cursor: pointer;
  background-color: #2f55df;
  &:hover:enabled {
    background-color: #466eff;
  }

  &:disabled {
    cursor: default !important;
    background-color: #5d7ffa;
  }
  z-index: 1;
}

.address {
  background-color: #fff;
  display: flex;
  flex-direction: column;
  padding: 13px 25px 10px 25px;
  border-top: 2px solid #f7f7f7;
  font-family: "RubikMedium", sans-serif;
  span {
    font-size: 12px;
    line-height: 16px;
    color: rgba(34, 36, 38, 1);
    max-width: 200px;
  }

  input {
    border: none;
    font-family: "RobotoMonoBold", sans-serif;
    font-size: 12px;
    line-height: 15px;
    color: rgba(34, 36, 38, 1);
    position: relative;
    top: 5px;
    width: 230px;
    height: 52px;
    white-space: pre-wrap;
    word-wrap: break-word;
    outline: none;
    resize: none;
    &::placeholder {
      color: rgba(34, 36, 38, 0.3);
      font-family: "RobotoMonoBold", sans-serif;
    }
  }
}

input:focus::-webkit-input-placeholder,
textarea:focus::-webkit-input-placeholder {
  color: transparent !important;
}

.errorMessage {
  font-family: "RubikMedium", sans-serif;
  display: flex;
  justify-content: center;
  padding-top: 10px;
  font-weight: 500;
  color: #df4b54;
  font-size: 12px;
}

h1 {
  padding-bottom: 20px;
  font-size: 17px;
}

.header h1.removePad {
  padding-bottom: 0px;
}
</style>
