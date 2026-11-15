> **BẢN CHÉP NGỮ CẢNH - KHÔNG PHẢI ĐẶC TẢ.** Bản này do agent chép và diễn giải từ một ảnh chụp slide nội bộ.
> Coi mọi cách hiểu, cách ánh xạ và kết luận trong đây là giả thuyết phải kiểm lại với Kevin. Không dùng làm nguồn học, không trích dẫn lại, không ra quyết định.

# Hệ sinh thái AI Appota Group - ngữ cảnh nơi dự án sẽ chạy

Owner: Phạm Bách Hiệp.
Mentor: Kevin.
Ngày đọc ảnh: 2026-11-12.
Nguồn: `C:\Users\Hiep\OneDrive\Pictures\Screenshots\Screenshot 2026-11-09 114409.png`, ảnh chụp ngày 2026-11-09 lúc 11:44:09.
Trạng thái: ghi chú ngữ cảnh nội bộ, chưa phải đặc tả, chưa phải ADR.

## 0. Tóm tắt

Slide vẽ mô hình hệ sinh thái AI của Appota Group thành bốn lớp và bốn chủ thể.

- **AgentLize** là AI Control Plane: kiến trúc, chính sách, danh mục tài sản AI, đo lường giá trị toàn Group.
- **Thổ Thần AI** là AI Execution Plane: nơi chạy Agent/Skill, workflow, model gateway, tool/MCP runtime, memory, telemetry.
- **Kdata** là hạ tầng và bảo mật: cloud, storage, secrets, network, vận hành, SLA.
- **Business / Data Owners** sở hữu dữ liệu, quy trình và hệ thống nghiệp vụ (HRM, Lark/Work, CRM, ERP, knowledge, game/pay).

Ba kết luận dùng được ngay cho dự án:

1. Lab Track 01 không đứng một mình. Nó là bản rút gọn của đường đi "yêu cầu -> quyền -> thực thi -> hành động -> đo lường" mà sơ đồ đặt giữa AgentLize và Thổ Thần AI.
2. Sơ đồ không có ô riêng cho duyệt người, idempotency, lọc trường theo quyền và chiều "mục đích" trong quyền. Bốn thứ này chính là phần lab đang xây, nên lab có chỗ đứng rõ ràng để trình bày.
3. Nếu dự án nhắm chạy trên Thổ Thần AI, hợp đồng tool phải đăng ký được vào danh mục của AgentLize, và telemetry phải đủ trường cho Value Intelligence. Đây là hai ràng buộc mới chưa có trong báo cáo 11/11.

## 1. Vì sao có file này

Báo cáo 11/11 mô tả bài toán và mô hình tối thiểu của lab, nhưng không nói lab nằm ở đâu trong hệ thống thật của công ty.
Slide này trả lời câu hỏi đó: ai sở hữu chính sách, ai chạy công cụ, ai giữ hạ tầng, ai sở hữu dữ liệu nghiệp vụ.

File này có ba mục đích:

- Lưu lại nội dung sơ đồ để không phải mở ảnh mỗi lần cần đối chiếu.
- Ánh xạ 12 thành phần của lab vào bốn lớp của sơ đồ, để biết phần nào là dựng lại, phần nào là gọi nền tảng có sẵn.
- Chốt danh sách câu hỏi phải hỏi Kevin trước khi viết ADR.

File này không quyết định stack, không chọn mô hình tích hợp, không thay ADR.

## 2. Bản chép sơ đồ

Chép theo đúng thứ tự trên ảnh, giữ nguyên từ ngữ tiếng Việt của slide.
Chỗ chữ mờ được đánh dấu bằng `[mờ]` và ghi cách đọc nghi ngờ.

### 2.1. Bốn lớp

**Lớp 0 - Người dùng và tác nhân**

- Nhân sự Appota (400+ người).
- Creator (tạo Skill/Agent), đăng nhập bằng SSO `@appota.com`.
- Agent (tự động, theo lịch).
- Mũi tên "Truy cập và sử dụng AI" đi vào AgentLize.
- Đơn vị thành viên: Gamota, Adsota, OTA Network, AppotaPay, Kdata và các đơn vị khác.

**Lớp 1 - AgentLize, AI Control Plane, "Đầu mối kiến trúc và Governance toàn Group"**

| Nhóm chức năng | Nội dung trên slide |
| --- | --- |
| AI Enablement | Cổng đăng Creator; Marketplace (Skill/Agent); Quản lý tài sản AI; Cơ chế thưởng và ghi nhận |
| Enterprise Context & Integration Registry | Kiến trúc Identity và Org; Danh mục dữ liệu, API/MCP; Mapping quyền và ngữ cảnh; Quản lý kết nối (Connector) |
| AI & Data Governance | Chính sách AI và dữ liệu; Phê duyệt và kiểm định; Quản lý vòng đời Agent/Skill; Audit, tuân thủ, quản trị rủi ro |
| Value Intelligence | Đo lường sử dụng; Hiệu quả nghiệp vụ (ROI); Báo cáo và phân tích; Cơ sở xét thưởng |

Bốn mũi tên từ AgentLize xuống Thổ Thần AI: "Chính sách và phân quyền", "Danh mục tài sản và kết nối", "Triển khai và cấu hình", "Telemetry và kết quả" (mũi tên hai chiều).

**Lớp 2 - Thổ Thần AI, AI Execution Plane, "Nền tảng thực thi AI"**

| Thành phần | Nội dung trên slide |
| --- | --- |
| Agent / Skill Runtime | Chạy agent và skill |
| Workflow Orchestration | Điều phối nhiều bước |
| Model Gateway | Cổng mô hình, đa mô hình |
| Tool / MCP Runtime | Gọi hệ thống nghiệp vụ |
| Memory | Ngữ cảnh làm việc |
| Telemetry & Logs | Nhật ký, giám sát |

Bốn mũi tên xuống Kdata: "Truy cập dữ liệu theo quyền", "Gọi API / Tool", "Kết quả và sự kiện", "Giám sát an toàn" (mũi tên hai chiều).

**Lớp 3 - Kdata, Infrastructure & Security, "Hạ tầng và bảo mật"**

- Cloud & Compute (hạ tầng chạy AI).
- Storage (lưu trữ và sao lưu).
- Security Operations (giám sát, phát hiện, ứng cứu).
- Secrets & Key Mgmt (quản lý khóa, thông tin mật).
- Network & Access (đường truyền, kiểm soát an toàn).
- Platform Operations (vận hành, SLA, HA).

**Lớp 4 - Enterprise Data & Business Systems, "do các đơn vị nghiệp vụ sở hữu"**

- HRM (HR Group).
- Lark / Work (IT và các phòng ban).
- CRM (BD/Sales).
- Finance / ERP (Finance Group).
- Knowledge / Docs (các Data Owner).
- Game / Pay / ... (công ty con).

### 2.2. Vai trò và trách nhiệm chính

**AgentLize (đầu mối chính)**

- Kiến trúc và chính sách AI toàn Group.
- Identity và Org Context, Integration Registry.
- AI và Data Governance (chính sách, phê duyệt, kiểm toán).
- Cổng đăng Creator, Marketplace, quản lý tài sản AI.
- Đo lường hiệu quả và cơ chế thưởng.

**Thổ Thần AI (thực thi AI)**

- Vận hành AI runtime: Agent/Skill, Workflow.
- Kết nối công cụ, API/MCP và hệ thống nghiệp vụ.
- Quản lý mô hình (Model Gateway), Memory.
- Ghi log, telemetry, đảm bảo thực thi theo chính sách.

**Kdata (hạ tầng và bảo mật)**

- Cung cấp và vận hành hạ tầng (cloud, compute, storage).
- Bảo mật hạ tầng: `[mờ]` giám sát, phát hiện, ứng cứu. Chữ đầu dòng không đọc rõ, nghi là "mã hóa".
- Quản lý secrets, khóa, chứng chỉ, định tuyến an toàn.
- Đảm bảo tính sẵn sàng, hiệu năng, SLA.

**Business / Data Owners (nghiệp vụ và dữ liệu)**

- Sở hữu dữ liệu và quy trình nghiệp vụ.
- Vận hành hệ thống nghiệp vụ (HRM, CRM, ERP, ...).
- Quyết định phạm vi và chia sẻ dữ liệu cho AI.
- Xác nhận kết quả và hiệu quả nghiệp vụ.

### 2.3. Ma trận trách nhiệm (RACI rút gọn)

Chú giải trên slide: A = chịu trách nhiệm cuối cùng, R = thực hiện, C = phối hợp, `-` = không tham gia.

| Hoạt động chính | AgentLize | Thổ Thần | Kdata | Business/Data Owner |
| --- | --- | --- | --- | --- |
| Chiến lược và kiến trúc AI | A/R | C | C | C |
| Identity và ngữ cảnh tổ chức | A/R | C | C | C |
| AI và Data Governance (chính sách) | A/R | C | C | C |
| Phê duyệt truy cập dữ liệu | A | C | C | R |
| Phát triển và quản lý tài sản AI (Skill/Agent) | A/R | C | - | C |
| Thực thi Agent/Workflow | C | A/R | C | C |
| Hạ tầng, lưu trữ và bảo mật hệ thống | C | C | A/R | - |
| Vận hành hệ thống nghiệp vụ và API dữ liệu | C | C | C | A/R |
| Đo lường hiệu quả và thưởng Creator | A/R | C | - | C |
| Ứng cứu sự cố và an toàn thông tin | A `[mờ, nghi là "đầu mối"]` | R | R | C |

Hai dòng đáng chú ý cho dự án: "Phê duyệt truy cập dữ liệu" để R ở Business/Data Owner, "Thực thi Agent/Workflow" để A/R ở Thổ Thần.

### 2.4. Luồng hoạt động tiêu biểu

"Từ yêu cầu đến kết quả và ghi nhận giá trị", sáu bước:

1. Người dùng đưa yêu cầu (qua Thổ Thần).
2. Xác thực và lấy ngữ cảnh: identity, quyền, chính sách từ AgentLize.
3. Thực thi Agent/Skill trên Thổ Thần; tool truy cập dữ liệu theo quyền.
4. Nhận kết quả và thực hiện hành động (đọc/ghi, tạo báo cáo, ...).
5. Ghi nhận và đo lường: telemetry về AgentLize, đánh giá hiệu quả.
6. Xét thưởng và cải tiến: cho Creator, tối ưu chính sách và Agent.

### 2.5. Nguyên tắc thiết kế và bảo mật

- Zero Trust (xác minh, tối thiểu quyền).
- Phân tách trách nhiệm (policy, execution, infra, data).
- Quyền theo ngữ cảnh: "Người dùng x Agent x Dữ liệu x Mục đích".
- Kiểm soát vòng đời: phê duyệt, triển khai, giám sát, thu hồi.
- Bảo vệ dữ liệu: phân loại, mã hóa, lưu giữ, xóa.
- Sẵn sàng mở rộng: nền tảng Appota và sản phẩm B2B.

## 3. Cách đọc sơ đồ

Sơ đồ là sơ đồ phân định trách nhiệm, không phải sơ đồ triển khai.
Nó trả lời "ai được quyết định cái gì", không trả lời "dịch vụ nào gọi dịch vụ nào, bằng giao thức gì".

Ba ranh giới quan trọng nhất:

- **Chính sách ở AgentLize, thực thi ở Thổ Thần.** AgentLize viết luật và cấp quyền; Thổ Thần chạy theo luật đó và không được tự nới quyền.
- **Dữ liệu thuộc đơn vị nghiệp vụ, không thuộc nền tảng.** Thổ Thần và AgentLize chỉ truy cập theo quyền mà Data Owner đã xác nhận.
- **Hạ tầng và bí mật thuộc Kdata.** Nền tảng AI không tự giữ khóa, không tự mở đường mạng.

Một điểm cần nói rõ khi trình bày: sơ đồ mô tả đích đến, không chứng minh năng lực hiện có.
Không có dòng nào trên slide nói ô nào đã chạy thật, ô nào còn là kế hoạch.

## 4. Ánh xạ vào lab Track 01

### 4.1. Mười hai thành phần của lab đặt ở đâu

| Thành phần trong lab | Vị trí tương ứng trên sơ đồ | Ghi chú |
| --- | --- | --- |
| Giao diện người dùng | Người dùng và tác nhân, bước 1 của luồng | Production dùng SSO `@appota.com`; lab dựng lại bằng giao diện tối giản |
| Agent | Agent / Skill Runtime (Thổ Thần) | Agent chỉ đề xuất, không giữ quyền, khớp cột "thực thi" của RACI |
| Tool registry | Enterprise Context & Integration Registry, Marketplace, Quản lý tài sản AI (AgentLize) | Lab giữ bản rút gọn của danh mục, không phải bản gốc |
| Bề mặt tool | Mapping quyền và ngữ cảnh, Danh mục tài sản và kết nối | Không có ô riêng; đây là phần lab tự định nghĩa |
| Kho quyền | Kiến trúc Identity và Org, Mapping quyền và ngữ cảnh (AgentLize) | Lab dựng bản giả lập của kho quyền |
| Policy engine | Chính sách AI và dữ liệu, Chính sách và phân quyền (AgentLize) | Lab không được tự đặt luật mới; chỉ hiện thực hóa luật đã có |
| Approval | Phê duyệt và kiểm định (AgentLize), nhưng đó là phê duyệt tài sản, không phải phê duyệt từng lần ghi | Khoảng trống lớn nhất, xem 4.2 |
| Executor | Tool / MCP Runtime (Thổ Thần) | Đúng nghĩa "một cửa cho mọi truy cập" |
| Idempotency store | Không có ô tương ứng; gần nhất Workflow Orchestration hoặc Memory | Khoảng trống thứ hai |
| Connector | Tool / MCP Runtime chạy, Quản lý kết nối (Connector) định nghĩa | Định nghĩa một nơi, chạy một nơi |
| Hệ thống nghiệp vụ | Enterprise Data & Business Systems | Lab mô phỏng danh bạ và công việc, không nối hệ thống thật |
| Trace | Telemetry & Logs (Thổ Thần), Value Intelligence và Đo lường sử dụng (AgentLize) | Trace của lab phải chở được trường mà Value Intelligence cần |

### 4.2. Bốn chỗ sơ đồ để trống mà lab đang xây

Đây là phần đáng giá nhất khi trình bày với nội bộ, vì nó biến lab từ "bài tập" thành "mảnh ghép còn thiếu".

1. **Duyệt người trước khi ghi.** Luồng sáu bước đi thẳng từ "nhận kết quả" sang "thực hiện hành động". Không có cổng nào chặn một ghi không đảo ngược.
2. **Idempotency.** Không có ô nào giữ khóa ghi và trạng thái giao dịch, nên "chạy lại đúng một lần" phải nằm ở đâu đó chưa được đặt tên.
3. **Lọc trường theo quyền.** "Mapping quyền và ngữ cảnh" nói có mapping, nhưng không nói ai thực thi việc cắt trường khi trả kết quả. Nếu runtime trả nguyên bản ghi thì quyền ở mức trường vô nghĩa.
4. **Chiều "mục đích" trong quyền.** Nguyên tắc ghi "Người dùng x Agent x Dữ liệu x Mục đích", nhưng không có thành phần nào giữ và kiểm chiều mục đích.

Ngoài ra còn hai chỗ mờ:

- Không nói nơi nào ghim phiên bản luật đã dùng cho một lần chạy, nên không tái hiện được quyết định cũ.
- Không nói lý do từ chối có được trả về cho người dùng hay không, trong khi báo cáo 11/11 đặt yêu cầu người dùng phải phân biệt "thiếu quyền" với "lỗi hệ thống".

### 4.3. Ràng buộc mới cho thiết kế lab

- **Hai loại danh tính, không phải một.** Sơ đồ có người dùng SSO và agent chạy tự động theo lịch. Khi agent chạy theo lịch không có người, grant phải xử lý bằng danh tính dịch vụ, không được mượn quyền một nhân viên.
- **Grant phải có bốn chiều, không phải ba.** Cặp `(người, agent, tool)` là chưa đủ; thêm dữ liệu và mục đích đúng như nguyên tắc trên slide.
- **Hợp đồng tool phải đăng ký được.** Nếu nhắm Thổ Thần AI, mỗi tool cần một bản khai báo đưa được vào Integration Registry, không chỉ là hàm Python trong repo.
- **Telemetry phải trả lời được câu hỏi của Value Intelligence.** Tối thiểu: ai, agent nào, tool nào, mục đích, kết quả, thời lượng, chi phí, phiên bản luật.
- **Không giữ bí mật.** Credential thuộc Kdata; connector trong lab giữ tham chiếu, không giữ khóa. Điều này khớp mục 5 của `AGENTS.md`.

## 5. Điều gì thay đổi trong kế hoạch

Không đổi năm mô hình bắt buộc phải khảo sát, không đổi tiêu chí SR1-SR8.
Thay đổi cách đặt câu hỏi cho từng mô hình và cho ADR.

- Khảo sát thêm một cột: mô hình đó cắm vào Thổ Thần AI ở đâu, và có khai báo được trong Integration Registry không.
- ADR phải có một mục "nơi chạy", so ba lựa chọn: lab độc lập; lab là Tool/MCP Runtime cắm vào Thổ Thần; lab là lớp policy đứng trước runtime.
- Đo lường phải tách theo lớp, vì production có hai team vận hành hai lớp khác nhau: độ trễ policy của AgentLize và độ trễ thực thi của Thổ Thần.
- "Agent thứ hai dùng lại tool" đổi cách diễn đạt thành "tài sản AI khai báo một lần, hai agent tiêu thụ", khớp ngôn ngữ Marketplace và quản lý tài sản.
- Demo và tài liệu dùng đúng từ vựng của sơ đồ (Control Plane, Execution Plane, Tool/MCP Runtime, Value Intelligence) để người review nội bộ nhận ra chỗ đứng của lab.

## 6. Câu hỏi phải hỏi Kevin

Xếp theo thứ tự chặn công việc, câu nào trả lời được thì ghi ngay vào file này.

1. Slide này là bản đã duyệt hay bản đề xuất? Có phiên bản, ngày và người sở hữu không?
2. Trong sáu ô của Thổ Thần AI, ô nào đã chạy thật, ô nào còn là kế hoạch? Riêng Tool/MCP Runtime đã có chưa?
3. Nếu đã có MCP runtime, nó là MCP gateway dùng chung hay mỗi connector một server? Ai giữ danh sách tool?
4. Policy của AgentLize có API truy vấn lúc chạy không, hay chính sách được nhúng vào cấu hình khi triển khai?
5. Duyệt người trước khi ghi nằm ở đâu: AgentLize, Thổ Thần, hay hệ thống nghiệp vụ? Nếu chưa có, lab có được phép đề xuất đặt ở runtime không?
6. Workflow Orchestration có sẵn cơ chế chạy lại đúng một lần không? Nếu có, lab bỏ idempotency store riêng.
7. Hệ thống nghiệp vụ nào là điểm thí điểm đầu tiên (Lark/Work, HRM, hay CRM)? Data Owner là ai?
8. Value Intelligence cần trường nào cho mỗi lần chạy để quy được hiệu quả và thưởng cho Creator?
9. Slide nội bộ này có được commit vào repo không? Nếu không, file này chỉ giữ bản chép, ảnh để ngoài repo.

## 7. Giới hạn của tài liệu này

- Đây là bản chép từ một ảnh chụp, không phải từ file gốc. Không có số trang, số phiên bản, tên người soạn, ngày ban hành.
- Ba chỗ chữ mờ đã được đánh dấu. Không được trích nguyên văn các chỗ đó như thể đã đọc chắc.
- Con số "400+ người" là số trên slide, chưa kiểm chứng.
- Sơ đồ có thể là trạng thái đích. Không được dùng nó để khẳng định năng lực hiện có của công ty.
- Tên "Thổ Thần AI" viết đúng dấu như trên slide. Nếu tên chính thức khác, sửa một lần ở đây và ở mọi chỗ tham chiếu.
- Ảnh gốc nằm ngoài repo, tại đường dẫn ở đầu file. Chưa đưa vào repo vì đây là tài liệu nội bộ và mục 5 của `AGENTS.md` cấm đưa thông tin nội bộ vào commit khi chưa được phép.
- File này không thay thế việc đọc báo cáo 11/11. Chỗ nào hai bên nói khác nhau, báo cáo 11/11 là bản đã review, file này là bản nháp.
