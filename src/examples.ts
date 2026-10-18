export const examples = {
  basic: {
    name: '審核流程',
    code: `flowchart TD
    A([開始]) --> B[提交申請]
    B --> C{資料是否完整？}
    C -->|是| D[進行審核]
    C -->|否| E[補齊資料]
    E --> B
    D --> F([完成])`,
  },
  groups: {
    name: '分組與服務',
    code: `flowchart LR
    subgraph client[使用者端]
        A[瀏覽器] --> B[送出請求]
    end
    subgraph server[服務端]
        subgraph processing[處理流程]
            C{驗證成功？} -->|是| D[處理資料]
        end
        C -->|否| E[回傳錯誤]
    end
    B --> C
    D --> F((完成))
    G[獨立節點]`,
  },
  branches: {
    name: '多行與分支',
    code: `graph LR
    A["收到訂單<br/>確認付款"] --> B{有庫存？}
    B -->|有| C[安排出貨]
    B -->|無| D[通知補貨]
    D -.-> B
    C ==> E((完成))`,
  },
  sequence: {
    name: '多代理時序圖',
    code: `sequenceDiagram
    autonumber
    participant U as User
    participant O as Orchestrator
    participant L as Lead Agent
    participant N as NeMo Evaluator
    participant P as Policy Engine
    participant D as Domain Agent
    participant G as Tool Gateway

    U->>O: Submit request
    O->>N: Input validation
    N-->>O: Pass / Block

    O->>L: Start swarm task
    L->>L: Generate task plan
    L->>N: Evaluate plan relevance and scope
    N-->>L: Evaluation signals

    loop Each proposed delegation
        L->>P: Authorize agent and task scope
        P-->>L: Allow / Verify / Deny
        alt Authorized
            L->>D: Delegate scoped task
            D->>G: Propose tool call
            G->>P: Authorize exact operation
            P-->>G: Policy decision
            alt Allowed
                G-->>D: Sanitized tool result
            else Rejected
                G-->>D: Denied with reason
            end
            D-->>L: Result and evidence
        else Not authorized
            L->>L: Replan or reject delegation
        end
    end

    L->>O: Aggregated result
    O->>N: Output validation
    N-->>O: Pass / Revise / Block
    O-->>U: Final response`,
  },
} as const;
