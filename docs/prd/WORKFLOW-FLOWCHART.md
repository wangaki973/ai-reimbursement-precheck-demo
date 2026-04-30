# AI报销预审助手 - 完整工作流程图

```mermaid
flowchart TD
    A[开始: 前端提交结构化发票JSON + user_message] --> B[输入校验\namount/user_id/expense_type 等]
    B -->|非法| B1[返回 block\nreason=输入参数非法]
    B -->|合法| C[Agent规则检查\n是否业务招待费 且 amount>500]

    C -->|否| D[字段已满足当前规则]
    C -->|是| E[检查必填字段\nclient_company_name / accompanying_headcount]
    E -->|缺失或格式错误| F[返回 pending_info\nrequired_fields + field_errors]
    F --> G[用户补充信息]
    G --> H{补充次数 < 3 ?}
    H -->|是| E
    H -->|否| H1[返回 block\nreason=信息补充不完整]

    E -->|齐全| D
    D --> I[调用工具\nquery_department_budget(user_id)]
    I -->|调用失败/超时| I1[返回 block\nreason=预算查询失败]
    I -->|成功| J{is_sufficient?}
    J -->|true| K[返回 pass\n可进入下一流程]
    J -->|false| L[返回 block\nreason=预算不足]

    K --> Z[结束]
    L --> Z
    B1 --> Z
    H1 --> Z
    I1 --> Z
```
