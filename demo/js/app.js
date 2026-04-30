(function () {
  const USE_MOCK_API = true;
  const API_BASE = "";

  const fieldLabelMap = {
    expense_type: "费用类型",
    client_company_name: "客户企业全称",
    accompanying_headcount: "内部陪同人数",
  };

  const dom = {
    messageInput: document.getElementById("messageInput"),
    voiceBtn: document.getElementById("voiceBtn"),
    photoBtn: document.getElementById("photoBtn"),
    photoInput: document.getElementById("photoInput"),
    replyForm: document.getElementById("replyForm"),
    dynamicFields: document.getElementById("dynamicFields"),
    chatList: document.getElementById("chatList"),
    fieldErrorsList: document.getElementById("fieldErrorsList"),
    queryBtns: document.querySelectorAll(".query-btn"),
    actionStrip: document.getElementById("actionStrip"),
    actionHint: document.getElementById("actionHint"),
    retryBtn: document.getElementById("retryBtn"),
  };

  const baseData = {
    session_id: "SES_20260428_0001",
    user_id: "EMP_001",
    expense_type: "业务招待费",
    amount: 850,
    merchant: "XX大酒楼",
    user_message: "报销昨晚请李总吃饭的费用",
    client_company_name: "",
    accompanying_headcount: "",
    input_mode: "structured_json",
  };

  let appState = {
    lastResponse: null,
    payload: { ...baseData },
    mode: "run",
  };

  function init() {
    bindEvents();
    resetForm();
  }

  function bindEvents() {
    dom.voiceBtn.addEventListener("click", onVoiceInput);
    dom.photoBtn.addEventListener("click", () => dom.photoInput.click());
    dom.photoInput.addEventListener("change", onPhotoUploaded);
    dom.retryBtn.addEventListener("click", onRetryBudgetCheck);
    dom.queryBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        dom.messageInput.value = btn.textContent.trim();
        onSendMessage();
      });
    });
    dom.messageInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        onSendMessage();
      }
    });
  }

  function resetForm() {
    appState.payload = { ...baseData };
    appState.mode = "run";
    appState.lastResponse = null;
    dom.replyForm.classList.add("hidden");
    dom.dynamicFields.innerHTML = "";
    dom.fieldErrorsList.innerHTML = "";
    dom.actionStrip.classList.add("hidden");
    dom.retryBtn.classList.add("hidden");
    dom.actionHint.textContent = "";
    dom.chatList.innerHTML = "";
    appendChat(
      "assistant",
      "嗨，你好，我是报销预审小助手。请告诉我报销信息，我会自动检查并提醒你补充材料。"
    );
    appendChat("user", "（上传发票图片）", { imageSrc: "./assets/sample-invoice.png" });
    appendChat(
      "assistant",
      "已自动识别发票信息：\n- 费用金额：¥850\n- 消费地点：上海浦东新区·江南里餐厅\n- 费用种类：业务招待费\n- 参与人员：2人\n- 客户信息：缺失"
    );
    appendChat("assistant", "请问发票的消费时间是？");
    appendChat("user", "2026年4月28日 19:40。");
    appendChat("assistant", "请问客户是哪家公司的？");
    appendChat("user", "客户是上海某某科技有限公司，陪同人数为2人。");
    appendChat("assistant", "信息已充足且预算充足，正在为您建立报销工单，请稍等几秒……");
    appendChat("assistant", "报销工单已生成：WO-RMB-202604-0192。");
    appendChat(
      "assistant",
      "最终核对信息如下：业务招待费 ¥850，消费时间 2026年4月28日 19:40，消费地点上海浦东新区·江南里餐厅，客户上海某某科技有限公司，陪同2人，预算校验通过。请回复“确认”即可进入报销流程。"
    );
    dom.messageInput.value = "";
  }

  function parseMessageToPayload(message) {
    const payload = appState.payload;
    payload.user_message = message;

    if (message.includes("业务招待")) payload.expense_type = "业务招待费";
    if (message.includes("差旅")) payload.expense_type = "差旅费";
    if (message.includes("办公")) payload.expense_type = "办公费";

    const amountMatch = message.match(/(\d+(?:\.\d+)?)\s*元?/);
    if (amountMatch) payload.amount = Number(amountMatch[1]);

    const companyMatch = message.match(/客户(?:是|为)?([^，。]+)/);
    if (companyMatch && companyMatch[1]) {
      payload.client_company_name = companyMatch[1].trim();
    }

    const headcountMatch = message.match(/(?:陪同|人数|同事)\s*(\d+)\s*人?/);
    if (headcountMatch) {
      payload.accompanying_headcount = Number(headcountMatch[1]);
    }

    return payload;
  }

  function appendChat(role, text, options = {}) {
    const wrapper = document.createElement("div");
    wrapper.className = "chat-item " + (role === "user" ? "chat-user" : "chat-assistant");
    if (options.example) {
      wrapper.classList.add("chat-example");
    }
    const content = document.createElement("div");
    content.className = "chat-content";
    const roleEl = document.createElement("p");
    roleEl.className = "chat-role";
    if (options.example) {
      roleEl.textContent = "示例";
    } else {
      roleEl.textContent = role === "user" ? "王晓明" : "小助手";
    }
    const bubble = document.createElement("div");
    bubble.className = "chat-bubble";
    bubble.textContent = text;
    if (options.imageSrc) {
      const image = document.createElement("img");
      image.className = "chat-image";
      image.src = options.imageSrc;
      image.alt = "发票示例图片";
      bubble.appendChild(document.createElement("br"));
      bubble.appendChild(image);
    }
    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.textContent = role === "user" ? "王" : "审";
    content.appendChild(roleEl);
    content.appendChild(bubble);
    if (role === "user") {
      wrapper.appendChild(content);
      wrapper.appendChild(avatar);
    } else {
      wrapper.appendChild(avatar);
      wrapper.appendChild(content);
    }
    dom.chatList.appendChild(wrapper);
    dom.chatList.scrollTop = dom.chatList.scrollHeight;
  }

  function renderRequiredInfo(requiredFields, fieldErrors) {
    if ((!requiredFields || requiredFields.length === 0) && (!fieldErrors || fieldErrors.length === 0)) {
      dom.fieldErrorsList.innerHTML = "";
      dom.dynamicFields.innerHTML = "";
      return;
    }

    dom.fieldErrorsList.innerHTML = "";
    (fieldErrors || []).forEach((item) => {
      const p = document.createElement("p");
      p.textContent = `${fieldLabelMap[item.field] || item.field}: ${item.message}`;
      dom.fieldErrorsList.appendChild(p);
    });

    dom.dynamicFields.innerHTML = "";
    const allFields = new Set([...(requiredFields || []), ...(fieldErrors || []).map((e) => e.field)]);
    allFields.forEach((field) => {
      const label = document.createElement("label");
      label.className = "field";
      const title = document.createElement("span");
      title.textContent = fieldLabelMap[field] || field;
      const input = document.createElement("input");
      input.name = field;
      input.dataset.dynamicField = "1";
      input.placeholder = "请填写";
      if (field === "accompanying_headcount") {
        input.type = "number";
        input.min = "1";
        input.step = "1";
      } else {
        input.type = "text";
      }
      label.appendChild(title);
      label.appendChild(input);
      dom.dynamicFields.appendChild(label);
    });

    const friendlyFields = (requiredFields || []).map((f) => fieldLabelMap[f] || f);
    const extra = friendlyFields.length ? `请补充：${friendlyFields.join("、")}。` : "请按下方表单补充信息。";
    appendChat("assistant", extra);
  }

  function renderResponse(res) {
    appState.lastResponse = res;
    if (res.status === "pending_info") {
      dom.replyForm.classList.remove("hidden");
      appState.mode = "reply";
      setAction("请先补齐信息后继续预审。", false);
    } else if (res.status === "pass") {
      dom.replyForm.classList.add("hidden");
      appState.mode = "run";
      setAction("预审通过，可继续后续提交流程。", false);
    } else {
      dom.replyForm.classList.add("hidden");
      appState.mode = "run";
      if (res.next_action === "retry_allowed") {
        setAction("预算服务暂时不可用，可重试预算校验。", true);
      } else {
        setAction("当前结果为拦截状态，请按提示处理。", false);
      }
    }

    renderRequiredInfo(res.required_fields, res.field_errors);
    if (res.tool_trace && res.tool_trace.conflict_detected) {
      appendChat(
        "assistant",
        "提示：你刚才的自然语言描述与结构化字段有冲突，系统已按结构化字段作为最终值。"
      );
    }
    if (res.tool_trace && res.tool_trace.session_expired) {
      appendChat("assistant", "会话失效后无法继续补充，请重新上传发票并发起预审。");
    }
    appendChat("assistant", res.ai_reply || "系统已返回结果。");
  }

  function setAction(text, showRetry) {
    if (!text) {
      dom.actionStrip.classList.add("hidden");
      dom.retryBtn.classList.add("hidden");
      dom.actionHint.textContent = "";
      return;
    }
    dom.actionStrip.classList.remove("hidden");
    dom.actionHint.textContent = text;
    if (showRetry) {
      dom.retryBtn.classList.remove("hidden");
    } else {
      dom.retryBtn.classList.add("hidden");
    }
  }

  async function callRunApi(payload) {
    if (USE_MOCK_API) return window.MockPrecheckApi.runPrecheck(payload);
    const resp = await fetch(`${API_BASE}/api/precheck/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return resp.json();
  }

  async function callReplyApi(payload) {
    if (USE_MOCK_API) return window.MockPrecheckApi.continuePrecheck(payload);
    const resp = await fetch(`${API_BASE}/api/precheck/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return resp.json();
  }

  async function onSendMessage() {
    const text = (dom.messageInput.value || "").trim();
    if (!text && appState.mode === "run") return;

    if (text) {
      appendChat("user", text);
      parseMessageToPayload(text);
      dom.messageInput.value = "";
    }

    dom.messageInput.disabled = true;
    try {
      let res;
      if (appState.mode === "run") {
        res = await callRunApi(appState.payload);
      } else {
        const replyPayload = {
          session_id: appState.payload.session_id,
          user_id: appState.payload.user_id,
          reply_message: text || "已补充信息",
          input_mode: "structured_json",
        };
        const dynamicInputs = dom.dynamicFields.querySelectorAll("[data-dynamic-field='1']");
        dynamicInputs.forEach((input) => {
          replyPayload[input.name] = input.value;
          appState.payload[input.name] = input.value;
        });
        res = await callReplyApi(replyPayload);
      }
      renderResponse(res);
    } catch (err) {
      appendChat("assistant", "系统异常，请稍后重试。");
    } finally {
      dom.messageInput.disabled = false;
      dom.messageInput.focus();
    }
  }

  function onVoiceInput() {
    dom.messageInput.value = "报销业务招待费850元，客户是上海某某科技有限公司，陪同2人";
    dom.messageInput.focus();
  }

  async function onRetryBudgetCheck() {
    appendChat("user", "重试预算校验");
    dom.messageInput.disabled = true;
    try {
      const retryPayload = Object.assign({}, appState.payload, { user_message: "重试预算校验" });
      const res = await callRunApi(retryPayload);
      renderResponse(res);
    } catch (err) {
      appendChat("assistant", "重试失败，请稍后再试。");
    } finally {
      dom.messageInput.disabled = false;
      dom.messageInput.focus();
    }
  }

  function onPhotoUploaded() {
    const file = dom.photoInput.files && dom.photoInput.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    appendChat("user", `已上传票据：${file.name}`, { imageSrc: url });
    appendChat("assistant", "收到图片。请再补充金额、费用类型和场景说明，我来继续预审。");
    dom.photoInput.value = "";
  }

  init();
})();
