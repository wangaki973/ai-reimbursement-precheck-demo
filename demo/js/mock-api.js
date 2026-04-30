(function () {
  const sessions = new Map();

  function asPositiveInt(value) {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(value);
    if (!Number.isInteger(n) || n <= 0) return NaN;
    return n;
  }

  function normalizeInput(input) {
    return {
      session_id: String(input.session_id || "").trim(),
      user_id: String(input.user_id || "").trim(),
      expense_type: String(input.expense_type || "").trim(),
      amount: input.amount === "" || input.amount === null ? null : Number(input.amount),
      merchant: String(input.merchant || "").trim(),
      user_message: String(input.user_message || "").trim(),
      client_company_name: String(input.client_company_name || "").trim(),
      accompanying_headcount:
        input.accompanying_headcount === "" || input.accompanying_headcount === null
          ? null
          : input.accompanying_headcount,
      input_mode: input.input_mode || "structured_json",
    };
  }

  function buildResponse({
    status,
    reason,
    ai_reply,
    required_fields,
    field_errors,
    next_action,
    tool_trace,
  }) {
    return {
      status,
      reason,
      ai_reply,
      required_fields: required_fields || [],
      field_errors: field_errors || [],
      next_action,
      tool_trace: Object.assign({ budget_checked: false }, tool_trace || {}),
    };
  }

  function getBudgetByUser(userId) {
    const table = {
      EMP_001: 5000,
      EMP_002: 700,
      EMP_003: 15000,
    };
    return { available_budget: table[userId] || 3000 };
  }

  function extractHeadcountFromText(text) {
    const match = String(text || "").match(/(?:陪同|人数|同事)\s*(\d+)\s*人?/);
    return match ? Number(match[1]) : null;
  }

  function evaluateAndRespond(payload, session) {
    const required = [];
    const fieldErrors = [];

    if (payload.input_mode !== "structured_json") {
      return buildResponse({
        status: "block",
        reason: "当前版本不支持OCR输入",
        ai_reply: "当前版本仅支持结构化JSON输入，请先提供结构化字段后再预审。",
        required_fields: [],
        field_errors: [],
        next_action: "show_result",
      });
    }

    if (!payload.session_id || !payload.user_id || payload.amount === null || Number.isNaN(payload.amount) || payload.amount < 0) {
      return buildResponse({
        status: "block",
        reason: "输入参数非法",
        ai_reply: "单据基础字段不完整或金额格式不正确，请检查后重试。",
        required_fields: [],
        field_errors: [],
        next_action: "show_result",
      });
    }

    const isBizReception = payload.expense_type === "业务招待费";
    const overThreshold = payload.amount > 500;

    if (!payload.expense_type) {
      required.push("expense_type");
    }

    if (isBizReception && overThreshold) {
      if (!payload.client_company_name) {
        required.push("client_company_name");
      }
      const headcount = asPositiveInt(payload.accompanying_headcount);
      if (payload.accompanying_headcount === null || payload.accompanying_headcount === "") {
        required.push("accompanying_headcount");
      } else if (Number.isNaN(headcount)) {
        fieldErrors.push({
          field: "accompanying_headcount",
          code: "INVALID_FORMAT",
          message: "内部陪同人数需为正整数",
        });
      }
    }

    if (required.length || fieldErrors.length) {
      if (session) {
        session.pendingAttempts += 1;
        if (session.pendingAttempts >= 3) {
          return buildResponse({
            status: "block",
            reason: "信息补充不完整",
            ai_reply: "连续三次补充仍不满足要求，当前单据已被拦截，请完善信息后重新发起。",
            required_fields: [],
            field_errors: [],
            next_action: "show_result",
          });
        }
      }
      const textParts = [];
      if (required.length) textParts.push("请补充必填字段");
      if (fieldErrors.length) textParts.push("请修正字段格式");
      return buildResponse({
        status: "pending_info",
        reason: textParts.join("，"),
        ai_reply:
          "系统识别到当前单据信息未完整。请按提示补充后再次提交，系统会继续自动预审。",
        required_fields: required,
        field_errors: fieldErrors,
        next_action: "wait_user_input",
      });
    }

    if (String(payload.user_message || "").includes("预算服务超时")) {
      return buildResponse({
        status: "block",
        reason: "预算查询失败，请稍后重试",
        ai_reply: "预算服务暂时不可用，你可以稍后重试预算校验。",
        required_fields: [],
        field_errors: [],
        next_action: "retry_allowed",
        tool_trace: {
          budget_checked: true,
          error: {
            code: "BUDGET_TIMEOUT",
            message: "budget service timeout",
          },
        },
      });
    }

    const budget = getBudgetByUser(payload.user_id);
    const isSufficient = budget.available_budget >= payload.amount;
    if (isSufficient) {
      return buildResponse({
        status: "pass",
        reason: "预算充足，规则校验通过",
        ai_reply: "预审通过：规则已满足且预算充足，可进入下一流程。",
        required_fields: [],
        field_errors: [],
        next_action: "show_result",
        tool_trace: {
          budget_checked: true,
          budget_request: { user_id: payload.user_id },
          budget_response: { available_budget: budget.available_budget },
          available_budget: budget.available_budget,
          compare_amount: payload.amount,
          is_sufficient: true,
          error: null,
        },
      });
    }

    return buildResponse({
      status: "block",
      reason: "预算不足",
      ai_reply: "预审未通过：部门可用预算不足，请调整单据或联系主管处理。",
      required_fields: [],
      field_errors: [],
      next_action: "show_result",
      tool_trace: {
        budget_checked: true,
        budget_request: { user_id: payload.user_id },
        budget_response: { available_budget: budget.available_budget },
        available_budget: budget.available_budget,
        compare_amount: payload.amount,
        is_sufficient: false,
        error: null,
      },
    });
  }

  function runPrecheck(input) {
    const payload = normalizeInput(input);
    const session = { pendingAttempts: 0, latestPayload: payload };
    sessions.set(payload.session_id, session);
    const response = evaluateAndRespond(payload, session);
    session.latestPayload = payload;
    return Promise.resolve(response);
  }

  function continuePrecheck(replyInput) {
    const payload = normalizeInput(replyInput);
    const session = sessions.get(payload.session_id);
    if (!session) {
      return Promise.resolve(
        buildResponse({
          status: "block",
          reason: "会话已失效，请重新发起预审",
          ai_reply: "当前会话已失效，请重新上传发票并发起预审。",
          required_fields: [],
          field_errors: [],
          next_action: "show_result",
          tool_trace: { budget_checked: false, session_expired: true },
        })
      );
    }
    const merged = Object.assign({}, session.latestPayload, payload);
    const textHeadcount = extractHeadcountFromText(payload.user_message || payload.reply_message);
    const structuredHeadcount =
      payload.accompanying_headcount === null || payload.accompanying_headcount === undefined || payload.accompanying_headcount === ""
        ? null
        : Number(payload.accompanying_headcount);
    const conflictDetected =
      textHeadcount !== null &&
      structuredHeadcount !== null &&
      Number.isFinite(structuredHeadcount) &&
      textHeadcount !== structuredHeadcount;

    const response = evaluateAndRespond(merged, session);
    if (conflictDetected) {
      response.ai_reply = "已收到补充信息。检测到自然语言与结构化字段存在冲突，系统已按结构化字段继续处理。";
      response.tool_trace = Object.assign({}, response.tool_trace || {}, {
        conflict_detected: true,
        conflict_field: "accompanying_headcount",
      });
    }
    session.latestPayload = merged;
    sessions.set(merged.session_id, session);
    return Promise.resolve(response);
  }

  window.MockPrecheckApi = {
    runPrecheck,
    continuePrecheck,
  };
})();
