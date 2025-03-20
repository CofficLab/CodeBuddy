<template>
  <div class="app-container">
    <!-- 未配置API密钥时显示提示 -->
    <div v-if="!hasApiKey" class="config-message">
      <h2>配置需要完成</h2>
      <p>请配置您的 {{ currentProvider }} API 密钥以开始使用AI聊天功能。</p>
      <button @click="openSettings">打开设置</button>
    </div>

    <!-- 已配置API密钥显示聊天界面 -->
    <div v-else class="chat-container">
      <div class="provider-select">
        <label>AI供应商: </label>
        <span>{{ currentProvider }}</span>
      </div>

      <div class="messages" ref="messagesContainer">
        <div v-for="(message, index) in messages" :key="index"
          :class="['message', message.role === 'user' ? 'user-message' : 'ai-message']">
          <div class="message-content">{{ message.content }}</div>
        </div>
        <div v-if="isLoading" class="message ai-message">
          <div class="message-content">思考中...</div>
        </div>
      </div>

      <div class="input-container">
        <textarea v-model="inputMessage" placeholder="输入消息..." @keydown.enter.prevent="sendMessage"
          :disabled="isLoading"></textarea>
        <button @click="sendMessage" :disabled="isLoading || !inputMessage.trim()">发送</button>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
interface Message {
  role: 'user' | 'assistant';
  content: string;
}

// 确保vscode对象在全局可用
declare const vscode: {
  postMessage: (message: any) => void;
};

export default {
  name: 'App',
  data() {
    return {
      // AI配置
      currentProvider: 'openai',
      hasApiKey: false,

      // 聊天状态
      messages: [] as Message[],
      inputMessage: '',
      isLoading: false
    };
  },
  mounted() {
    // 监听来自扩展的消息
    window.addEventListener('message', this.handleExtensionMessage);
  },
  beforeUnmount() {
    // 移除监听器
    window.removeEventListener('message', this.handleExtensionMessage);
  },
  methods: {
    handleExtensionMessage(event: MessageEvent) {
      const message = event.data;

      switch (message.command) {
        case 'setConfig':
          this.currentProvider = message.aiProvider;
          this.hasApiKey = message.hasApiKey;
          break;

        case 'configurationRequired':
          this.hasApiKey = false;
          this.currentProvider = message.provider;
          break;

        case 'aiResponse':
          this.isLoading = false;
          this.messages.push({
            role: 'assistant',
            content: message.response
          });
          this.scrollToBottom();
          break;

        case 'error':
          this.isLoading = false;
          this.messages.push({
            role: 'assistant',
            content: `错误: ${message.message}`
          });
          this.scrollToBottom();
          break;
      }
    },

    sendMessage() {
      if (!this.inputMessage.trim() || this.isLoading) return;

      // 添加用户消息
      this.messages.push({
        role: 'user',
        content: this.inputMessage
      });

      // 发送消息到扩展
      vscode.postMessage({
        command: 'fetchAIResponse',
        prompt: this.inputMessage
      });

      // 清空输入并显示加载状态
      this.inputMessage = '';
      this.isLoading = true;
      this.scrollToBottom();
    },

    openSettings() {
      vscode.postMessage({
        command: 'openSettings',
        provider: this.currentProvider
      });
    },

    scrollToBottom() {
      // 滚动到底部
      this.$nextTick(() => {
        if (this.$refs.messagesContainer) {
          const container = this.$refs.messagesContainer as HTMLElement;
          container.scrollTop = container.scrollHeight;
        }
      });
    }
  }
};
</script>

<style>
.app-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100%;
  background-color: #f5f5f5;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
}

.config-message {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 2rem;
  text-align: center;
}

.config-message h2 {
  margin-bottom: 1rem;
  color: #333;
}

.config-message button {
  margin-top: 1rem;
  padding: 0.5rem 1rem;
  background-color: #007acc;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.chat-container {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.provider-select {
  padding: 0.5rem 1rem;
  background-color: #eaeaea;
  border-bottom: 1px solid #ccc;
  display: flex;
  align-items: center;
}

.provider-select span {
  font-weight: bold;
  margin-left: 0.5rem;
  text-transform: capitalize;
}

.messages {
  flex: 1;
  padding: 1rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.message {
  max-width: 80%;
  padding: 0.5rem 1rem;
  border-radius: 8px;
  margin-bottom: 0.5rem;
}

.user-message {
  align-self: flex-end;
  background-color: #007acc;
  color: white;
}

.ai-message {
  align-self: flex-start;
  background-color: #e5e5e5;
  color: #333;
}

.input-container {
  display: flex;
  padding: 1rem;
  background-color: #eaeaea;
  border-top: 1px solid #ccc;
}

.input-container textarea {
  flex: 1;
  padding: 0.5rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  resize: none;
  height: 40px;
  font-family: inherit;
}

.input-container button {
  margin-left: 0.5rem;
  padding: 0.5rem 1rem;
  background-color: #007acc;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.input-container button:disabled {
  background-color: #ccc;
  cursor: not-allowed;
}
</style>