<template>
  <div class="sign">
    <div class="header">
      <div class="headerText no-hl container">
        <h1>Sign</h1>
      </div>
    </div>
    <div class="overview no-hl">
      <div class="message">
        <span class="address">Message</span>
        <textarea
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
          maxlength="65"
          type="text"
          placeholder="...message to sign"
          v-model="message"
        ></textarea>
      </div>

      <div class="errorMessage" v-if="errorMessage">{{errorMessage}}</div>
    </div>

    <button class="sign no-hl" @click="trySign()">
      <span>Sign Message</span>
    </button>
  </div>
</template>

<script>
import navigation from "../navigation.js";
export default {
  name: "sign",
  data() {
    return {
      message: "",
      errorMessage: false,
    };
  },

  async created() {
    this.$bus.onMessage.addListener(this.bgMessages);
    this.$bus.postMessage({ action: "update" });
  },

  methods: {
    bgMessages(msg) {
      if (msg.action === "errorMessage") {
        this.errorMessage = msg.data;
      }

      if (msg.action === "update") {
        // do something?
      }
    },

    trySign() {
      this.errorMessage = false;
      if (this.offline) {
        this.errorMessage = "You are disconnected";
        return;
      }
      if (this.message.length == 0) {
        this.errorMessage = "Message is empty";
        return;
      }

      this.errorMessage = false;
      this.$bus.postMessage({
        action: "sign",
        data: { message: this.message }
      });
    }
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

.message{
  background-color: #fff;
  display: flex;
  flex-direction: column;
  padding: 13px 25px 10px 25px;
  border-top: 2px solid #f7f7f7;
  font-family: "RubikMedium", sans-serif;
  span {
    font-size: 12px;
    line-height: 16px;
    color: rgba(34, 36, 38, 0.3);
    max-width: 100px;
  }

  textarea {
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

.max {
  font-family: "RubikMedium", sans-serif;
  font-weight: 500;
  position: absolute;
  right: 30px;
  margin-top: 7px;
  font-size: 11px;
  color: #2224263b;
}

.max:hover {
  color: rgba(34, 36, 38, 1);
  cursor: pointer;
}

.confirmScreen {
  background-color: #1f378d;
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  top: 123px; // header height

  p {
    font-family: "RubikMedium", sans-serif;
    font-size: 13px;
    line-height: 17px;
    text-align: center;
    color: rgba(255, 255, 255, 0.27);
    margin: 0;
  }

  p:first-child {
    padding-top: 30px;
  }

  .message {
    font-family: "RobotoMonoBold", sans-serif;
    font-size: 12px;
    line-height: 15px;
    text-align: center;
    color: #ffffff;
    width: 237px;
    word-break: break-all;
    padding-top: 5px;
  }
}

h1 {
  padding-bottom: 20px;
  font-size: 17px;
}

.header h1.removePad {
  padding-bottom: 0px;
}
</style>
