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
          type="text"
          placeholder="...message to sign"
          v-model="message"
        ></textarea>
      </div>

      <div class="errorMessage" v-if="errorMessage">{{errorMessage}}</div>

      <div class="message">
        <span class="address">Signature</span>
        <textarea
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
          readonly="true"
          type="text"
          placeholder="...signature"
          v-model="signature"
        ></textarea>
      </div>
    </div>

    <div class="copyHolder">
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        class="copy"
        xmlns="http://www.w3.org/2000/svg"
        @click="copied()"
      >
        <path
          d="M11.0833 12.25H4.66667V4.08334H11.0833V12.25ZM11.0833 2.91667H4.66667C4.35725 2.91667 4.06051 3.03959 3.84171 3.25838C3.62292 3.47717 3.50001 3.77392 3.50001 4.08334V12.25C3.50001 12.5594 3.62292 12.8562 3.84171 13.075C4.06051 13.2938 4.35725 13.4167 4.66667 13.4167H11.0833C11.3928 13.4167 11.6895 13.2938 11.9083 13.075C12.1271 12.8562 12.25 12.5594 12.25 12.25V4.08334C12.25 3.77392 12.1271 3.47717 11.9083 3.25838C11.6895 3.03959 11.3928 2.91667 11.0833 2.91667V2.91667ZM9.33334 0.583336H2.33334C2.02392 0.583336 1.72717 0.706252 1.50838 0.925045C1.28959 1.14384 1.16667 1.44058 1.16667 1.75V9.91667H2.33334V1.75H9.33334V0.583336Z"
          fill="#222426"
        ></path>
      </svg>
      <span class="copied" v-bind:class="{ show: copy_clicked }">COPIED!</span>
    </div>

    <button class="sign no-hl" @click="trySign()"> Sign Message </button>
  </div>
</template>

<script>
import navigation from "../navigation.js";
export default {
  name: "sign",
  data() {
    return {
      message: "",
      signature: "",
      errorMessage: false,
      copy_clicked: false
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
        this.signature = msg.data.signature;
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
      this.signature = '...signing';

      this.errorMessage = false;
      this.$bus.postMessage({
        action: "sign",
        data: { message: this.message }
      });
    },

    copied() {
      this.$copyText(this.signature);
      this.copy_clicked = true;
      setTimeout(() => {
        this.copy_clicked = false;
      }, 400);
    }
  },
  mixins: [navigation]
};
</script>

<style lang="scss" scoped>
.header {
  height: 123px;
}

.overview {
  padding: 5px 0 0 0;
  background-color: #fff;
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
    height: 40px;
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

.copyHolder {
  display: flex;
  justify-content: center;
  position: relative;
  width: 280px;
}

.copy {
  color: #222426;
  cursor: pointer;
  position: relative;
  left: 15px;
  padding: 5px;
  border-radius: 100%;
  &:hover {
    background-color: #e6e6e6;
  }
}

.copied {
  visibility: hidden;
  text-transform: uppercase;
  font-family: "RubikMedium";
  color: #42a07f;
  transition: all 1s;
  font-size: 11px;
  position: relative;
  left: 23px;
  top: 6px;
}

.show {
  visibility: visible;
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

h1 {
  padding-bottom: 20px;
  font-size: 17px;
}

.header h1.removePad {
  padding-bottom: 0px;
}
</style>
