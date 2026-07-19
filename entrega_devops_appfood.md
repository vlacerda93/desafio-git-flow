# Projeto de Migração AppFood: Monólito para Microsserviços

## 1. Engenharia de Requisitos & Organização Ágil

### 1.1 Mapeamento de Domínios e Requisitos Funcionais
Para suportar o dimensionamento futuro dos contêineres e isolamento, definimos os seguintes requisitos técnicos para cada domínio:

**Módulo de Usuários (Autenticação, Tokens, Perfis)**
1. O serviço deve autenticar usuários e emitir um JWT (JSON Web Token) criptografado válido por 1 hora, para comunicação segura sem gestão de sessão em memória.
2. O sistema deve aplicar hash criptográfico (ex: bcrypt ou Argon2) em todas as senhas antes da persistência no banco de dados.

**Módulo de Pedidos (Carrinho, Checkout, Estados)**
1. O sistema deve utilizar uma camada de banco de dados em cache (ex: Redis) para persistir o estado do carrinho de compras do usuário, garantindo resiliência e baixa latência.
2. O sistema deve implementar uma máquina de estados finita para processar e registrar o rastreamento do pedido (Criado, Aguardando Pagamento, Preparando, Enviado, Concluído).

**Módulo de Pagamentos (Gateways, Estornos, Processamento)**
1. O serviço deve processar os pagamentos e estornos de forma assíncrona utilizando mensageria/filas (ex: RabbitMQ/Kafka) ao integrar com gateways externos.
2. O sistema deve implementar um padrão de "Circuit Breaker" (disjuntor) para evitar lentidão em cascata caso o serviço do gateway de pagamento fique indisponível.

**Módulo de Vendas (Relatórios, Faturamento, Cupons)**
1. O serviço deve permitir o cadastro de regras de cupons e validá-las em tempo real (vigência, regras) antes de aplicar o desconto sobre os relatórios consolidados.
2. O serviço deve agregar transações concluídas por processamento em lote (batch) noturno para geração automática de relatórios analíticos de faturamento em CSV/PDF.

### 1.2 Gestão de Fluxo via Kanban Digital
O processo de migração será gerenciado via Kanban. Abaixo as demandas distribuídas seguindo o fluxo de qualidade:

* **To Do:** "Criar repositórios Git isolados para cada microsserviço", "Estruturar cluster Kubernetes no provedor cloud".
* **In Progress:** "Escrever Dockerfile multi-stage (base Alpine) para o módulo de Pagamentos", "Configurar segredos de conexão de banco de dados (Secrets) no Kubernetes".
* **Code Review:** "Revisão do código da API Restful do Módulo de Pedidos", "Revisão do manifesto YAML do Deployment do Módulo de Vendas".
* **Testing:** "Desenhar alertas de latência no Prometheus", "Realizar teste de carga no microsserviço de Usuários no ambiente de Staging".
* **Done:** "Pipeline de CI/CD do Módulo de Pagamentos finalizada", "Cluster Kubernetes provisionado e Load Balancer ativo para produção".

---

## 2. Automação com Pipeline de CI/CD e Ciclo do Docker

A adoção de microsserviços exige que cada componente tenha seu repositório isolado e sua esteira autônoma.

**1. Etapas Obrigatórias da Esteira**
* **Build:** O código recebido do repositório é compilado/transpilado e tem suas dependências resolvidas para garantir integridade sintática e criação dos binários.
* **Lint & Quality:** Ferramentas de análise estática (Linters e SonarQube, por exemplo) inspecionam o código em busca de quebra de guias de estilo (PEP8, ESLint) e code smells.
* **Test:** Disparo imediato da suíte de testes unitários e de integração, com barreiras configuradas para bloquear o fluxo se a cobertura mínima não for atingida.
* **SAST:** Análise estática de segurança validando vulnerabilidades conhecidas em pacotes externos (dependências) e mapeando riscos no código fonte (ex: injeção de SQL).
* **Package (Artefato):** O código que sobreviveu aos testes e qualidade é fechado num artefato executável que será transformado em imagem.

**2. Fluxo de Empacotamento com Docker**
* **Construção:** É construída uma imagem baseada em um `Dockerfile` configurado como `multi-stage`. Usa-se imagens base ultraleves (`Alpine` ou `Distroless`) descartando os compiladores e enviando apenas os binários para reduzir a superfície de ataques e otimizar tempo de download.
* **Armazenamento:** Essa imagem compilada é assinada, tageada e enviada (Push) para um "Container Registry" corporativo (como DockerHub, ACR ou AWS ECR) protegido contra acessos externos.
* **Instanciação:** O orquestrador realiza o download (Pull) da imagem a partir do Registry e a inicializa como um contêiner dinâmico e isolado, garantindo paridade total entre os ambientes.

---

## 3. Orquestração e Desacoplamento com Kubernetes

### 3.1 Isolamento Estrutural: Padrão Database-per-Service
No antigo monólito, os dados brigavam por espaço em uma única base de dados. O abandono do banco compartilhado é vital na adoção de microsserviços pelos seguintes motivos de engenharia:
1. **Fim do Ponto Único de Falha:** Se o banco de "Carrinhos" ou "Pagamentos" apresentar falha grave e corromper, ele só derruba aquele módulo em específico. O serviço de autenticação e os perfis de usuários continuam de pé (Resiliência).
2. **Desacoplamento Transacional:** Evita travamentos de leitura/escrita (Deadlocks) onde um relatório pesado no Módulo de Vendas travaria tabelas necessárias para os checkouts de Pagamentos.
3. **Escalabilidade e Poliglotismo de Dados:** Permite que o módulo de Pedidos use uma solução NoSQL chave-valor ultra-rápida, enquanto o de Vendas use SQL para relatórios densos, escalando discos e instâncias separadamente.

### 3.2 Topologia Arquitetural e Orquestração

Abaixo está a representação lógica dos componentes orquestrados no cluster de destino:

```mermaid
graph TD
    Client((Clientes / APP)) -->|Requisição HTTPS| LB[Load Balancer Externo]
    
    subgraph Cluster Kubernetes
        LB --> Front[Pod: Frontend Web/App]
        
        Front -->|Comunicação Segregada| Ingress[Ingress / API Gateway]
        
        Ingress --> PodUsers[Pod: Módulo de Usuários]
        Ingress --> PodOrders[Pod: Módulo de Pedidos]
        Ingress --> PodPay[Pod: Módulo de Pagamentos]
        Ingress --> PodSales[Pod: Módulo de Vendas]
        
        PodUsers --> DBUsers[(DB: PostgreSQL \n Usuários)]
        PodOrders --> DBOrders[(DB: Redis \n Pedidos/Carrinho)]
        PodPay --> DBPay[(DB: MySQL \n Pagamentos)]
        PodSales --> DBSales[(DB: PostgreSQL \n Vendas)]
        
        subgraph Telemetria e Observabilidade
            Prometheus[Prometheus: Coleta Pull]
            Grafana[Grafana: Dashboards e Alertas]
            
            Prometheus -. "Raspa métricas HTTP, CPU, RAM" .-> PodUsers
            Prometheus -. "Raspa métricas" .-> PodOrders
            Prometheus -. "Raspa métricas" .-> PodPay
            Prometheus -. "Raspa métricas" .-> PodSales
            
            Grafana -. "Lê dados" .-> Prometheus
        end
    end
    
    Nodes[Nodes do Cluster - Pool de Servidores Físicos/Virtuais que sustentam os Pods] -.- Cluster Kubernetes
```

**Mapeamento Operacional:**
* **Load Balancer:** Distribuidor frontal, recebe o tráfego da rede mundial de computadores e espalha a carga sem sobrecarregar um único local.
* **Nodes e Cluster:** A espinha dorsal física/virtual da operação. Os agrupamentos de máquinas ("Nodes") formam o "Cluster", garantindo a memória e CPU necessárias para operar os contêineres.
* **Pods (Os Microsserviços):** Envolvem o Docker. Representam a camada de abstração mínima. Executam e isolam as instâncias de Vendas, Pagamentos, Usuários e Pedidos, permitindo aplicar autoscaling individual.
* **Frontend:** Isolado propositalmente em Pods de interface (SSR/SPA) na borda, impedindo que o processamento estético de telas afete e roube CPU das pesadas lógicas operacionais e de cálculos transacionais.

---

## 4. Documento de Fundamentação Técnica (Memorial Descritivo)

Abaixo estão detalhadas as diretrizes tecnológicas adotadas no ecossistema e o real motivo de serem o antídoto à crise estrutural da AppFood:

**1. Git (Controle de Versão)**
* **O que é:** Sistema de controle de versão distribuído que mapeia históricos de mudança de código-fonte.
* **Motivo na AppFood:** Evita a sobreposição de código. Com múltiplos times atuando em módulos distintos agora, o Git viabiliza ramificações (branches) independentes. Cada microsserviço terá seu próprio repositório isolado, garantindo o versionamento autônomo.

**2. Pipeline CI/CD (Integração e Entrega Contínuas)**
* **O que é:** Uma sequência imutável e automática de validações que abrange da compilação de código ao deploy produtivo.
* **Motivo na AppFood:** Impede tragédias em produção. A "quebra total" sofrida pela AppFood será mitigada, pois o código não passará pelo "Build", "Lint", "Test" e "SAST" sem ser barrado em caso de erros e anomalias de segurança, automatizando lançamentos.

**3. Docker (Conteinerização)**
* **O que é:** Plataforma de encapsulamento virtual que empacota aplicações e suas dependências.
* **Motivo na AppFood:** Garante padronização extrema ("Funciona na minha máquina, mas no servidor não"). Para a AppFood, é a peça central que permite a portabilidade dos novos microsserviços do ambiente de testes local do desenvolvedor direto para as instâncias do servidor em nuvem com funcionamento perfeito.

**4. Kubernetes (K8s) (Orquestração de Contêineres)**
* **O que é:** Sistema autônomo open-source para automação de deployment, resiliência e escalonamento de contêineres.
* **Motivo na AppFood:** Fim da queda generalizada. É o coração do ecossistema moderno. O Kubernetes distribuirá de forma equilibrada as instâncias de "Pagamento" e "Vendas", permitindo subir mais réplicas de um microsserviço automaticamente em caso de alta demanda de processamento, além de auto-curar contêineres mortos.

**5. Prometheus (Métricas)**
* **O que é:** Sistema analítico de observabilidade focado em coleta "Pull" de dados de séries temporais dimensionais.
* **Motivo na AppFood:** Centraliza os "sinais vitais". O Prometheus extrairá diretamente dos Pods as taxas de erro HTTP, latência e consumo de CPU. No caso do módulo de pagamentos cair, o Prometheus já registrou a anomalia através de métricas como `http_requests_total{status="500"}`.

**6. Grafana (Visualização)**
* **O que é:** Plataforma avançada e visual de inteligência de infraestrutura em nuvem, baseada em painéis em tempo real.
* **Motivo na AppFood:** Retira a "venda dos olhos" da Diretoria. Os dados brutos do Prometheus não são compreendidos pela gestão. O Grafana transformará essas métricas em Dashboards visuais interativos que alertarão instantaneamente onde o gargalo da operação reside.
