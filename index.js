const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

const dbHost = process.env.DB_HOST;
const logLevel = process.env.LOG_LEVEL;
const maintenanceMode = process.env.MAINTENANCE_MODE;
const dbPassword = process.env.DB_PASSWORD;
const dbDelay = parseInt(process.env.DB_DELAY) || 0;

// 1. Middleware de Log (Poluição visual)
app.use((req, res, next) => {
  if (logLevel === 'DEBUG') {
    console.log(`[DEBUG] --- Nova Requisição Interceptada ---`);
    console.log(`[DEBUG] Método da requisição: ${req.method}`);
    console.log(`[DEBUG] Rota acessada: ${req.url}`);
    console.log(`[DEBUG] Timestamp: ${new Date().toISOString()}`);
    console.log(`[DEBUG] Status de memória do Node: ${JSON.stringify(process.memoryUsage())}`);
    console.log(`[DEBUG] --- Encaminhando para os próximos middlewares ---`);
  }
  next();
});

// Middleware de Manutenção Esquecida
app.use((req, res, next) => {
  if (maintenanceMode === 'ON') {
    // Trava todas as requisições com 503
    return res.status(503).json({
      erro: "Sistema em manutenção programada. Por favor, tente novamente mais tarde."
    });
  }
  next();
});

// Rota de consulta de logística
app.get('/entregas', (req, res, next) => {

  // Simulação de Lentidão Extrema no Banco (Usa a variável DB_DELAY)
  setTimeout(() => {

    // Validação de Senha do Banco de Dados
    if (dbPassword !== 'senha_secreta_2026') {
      return next(new Error("FATAL: Falha de autenticação no banco de dados. Credenciais inválidas!"));
    }

    // A sua regra condicional baseada na variável LOG_LEVEL
    if (logLevel === 'ERROR') {
      next(new Error("Falha catastrófica no banco de dados!"));
    } else {
      console.log(`[DB] Estabelecendo conexão com o servidor de banco de dados em: ${dbHost}`);
      const pacotes = [
        { id: 1, destinatario: "João da Silva", status: "Em trânsito" },
        { id: 2, destinatario: "Maria Oliveira", status: "Aguardando coleta" }
      ];
      res.json(pacotes);
    }

  }, dbDelay);
});

// Middleware de tratamento de erros
app.use((err, req, res, next) => {
  console.error(`[ERROR] Ocorreu um erro interno no servidor (500): ${err.message}`);
  res.status(500).json({ error: "Erro interno do servidor" });
});

// Inicia o servidor
app.listen(port, () => {
  if (logLevel !== 'ERROR') {
    console.log(`Servidor de logística rodando na porta ${port}`);
    console.log(`Modo de log atual: ${logLevel}`);
  }
});
