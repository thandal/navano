<template>
  <div class="backup">
    <div class="header">
      <div class="headerText no-hl container">
        <h1>Backup wallet</h1>
      </div>
    </div>

    <div class="overview container">
      <p>
        Make sure to write down your seed or save it somewhere safe,
        and never share it with anyone! It is the master key to your Nano wallet,
        and the only way to recover your funds in an emergency.
      </p>
      <div class="showSeed">
        <input
          type="password"
          placeholder="Enter password"
          autocomplete="off"
          v-model="show_pw"
          ref="show_pw"
        >
        <button @click="showSeed">Show seed</button>
      </div>
      <div class="overlay" v-if="showTheSeed">
        <div class="seed">{{ showTheSeed }}</div>
        <button @click="closeShow" class="closeSeed">Close</button>
      </div>
    </div>
  </div>
</template>

<script>
import navigation from "../navigation.js";
import {
  getLocalStorageItem,
  setLocalStorageItem,
  decryptString,
  encryptString
} from "../../../utils/services.js";

export default {
  name: "backup",
  data() {
    return {
      show_pw: "",
      checked: false,
      showTheSeed: false
    };
  },
  methods: {
    bgMessages(msg) {},

    removeData() {
      this.$refs.label.classList.remove("errorMessage");
      if (this.checked) {
        this.$bus.postMessage({ action: "removeWallet" });
        return;
      }
      this.$refs.label.classList.add("errorMessage");
    },

    async showSeed() {
      this.$refs.show_pw.classList.remove("error");

      let encryptedSeed = (await getLocalStorageItem("encryptedSeed")) || false;
      try {
        let seed = decryptString(encryptedSeed, this.show_pw);

        if (!/[0-9A-Fa-f]{64}/g.test(seed) || this.show_pw.length < 2) {
          this.$refs.show_pw.classList.add("error");
          return;
        }

        this.showTheSeed = seed;
      } catch (err) {
        console.log(err);
        this.$refs.show_pw.classList.add("error");
        return;
      }
    },

    closeShow() {
      this.showTheSeed = false;
      this.show_pw = "";
    }
  },
  beforeMount() {
    this.$bus.onMessage.addListener(this.bgMessages);
  },
  mixins: [navigation]
};
</script>

<style lang="scss" scoped>
.wallet {
  background-color: #f7f7f7 !important;
  height: 100%;
}

.errorMessage {
  color: #df4b54;
}

h1 {
  padding-bottom: 20px;
  font-size: 17px;
}

.header {
  height: 123px;
}

.overview {
  div {
    padding: 10px 0 0 0;
  }

  .showSeed {
    button {
      margin-top: 17px;
    }
  }

  p {
    padding: 20px 0 0 0;
    color: #222426;
    font-family: "RubikMedium";
  }
}

button {
  font-family: "RubikMedium";
  width: 230px;
  border: none;
  background: #2f55df;
  font-size: 13px;
  line-height: 18px;
  text-align: center;
  color: #ffffff;
  border-radius: 2px;
  height: 40px;
  cursor: pointer;
  font-family: "RubikMedium";
  &:hover {
    background-color: #466eff;
  }
}
input[type="password"] {
  width: 230px;
  background: #fff;
  border-radius: 2px;
  height: 35px;
  color: rgba(34, 36, 38, 1);
  outline: none;
  box-sizing: border-box;
  padding: 10px 15px;
  border: 1px solid transparent;
  &::placeholder,
  &::-moz-placeholder,
  &:-moz-placeholder,
  &::-webkit-input-placeholder {
    font-style: normal;
    font-weight: 500;
    font-size: 12px;
    line-height: 16px;
    color: rgba(34, 36, 38, 0.4);
  }
}

.overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.2);
  z-index: 3;
}

.seed {
  background-color: #fff;
  font-family: "RobotoMonoMedium", monospace;
  line-height: 21px;
  font-size: 15px;
  text-align: justify;
  letter-spacing: 0.22em;
  color: rgba(34, 36, 38, 0.3);
  white-space: pre-wrap;
  word-wrap: break-word;
  width: 200px;
  overflow: hidden;
  padding: 15px 15px 35px 15px !important;
  margin: 100px auto 20px auto;
  box-shadow: 0px 4px 20px rgba(0, 0, 0, 0.1);
  border-radius: 2px;
}

button.closeSeed {
  font-family: "RubikMedium", sans-serif;
  width: 230px;
  margin: 0 auto;
  display: block;
  position: relative;
  top: -30px;
}
.overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.8);
  z-index: 3;
}
</style>
