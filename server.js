const express = require('express');
const app = express();

app.use(express.json());
app.use(express.static('public')); // Serve os arquivos da pasta 'public'

// Banco de dados em memória simplificado
const convites = {};

// Rota para criar o convite (criar.html)
app.post('/api/criar-convite', (req, res) => {
    const nomeCriador = req.body.nomeCriador || (req.body.criador && req.body.criador.nome);
    const whatsappCriador = req.body.whatsappCriador || (req.body.criador && req.body.criador.contactInfo);
    // Captura a ocasião enviada pelo front-end (se não vier, define 'date' como padrão)
    const ocasiao = req.body.ocasiao || 'date'; 

    if (!nomeCriador || !whatsappCriador) {
        return res.status(400).json({ sucesso: false, erro: "Dados incompletos." });
    }

    // Gera um ID simples usando o timestamp atual
    const idUnico = Date.now().toString();

    convites[idUnico] = {
        nomeCriador,
        whatsappCriador,
        ocasiao, // Salvando a ocasião escolhida no banco de dados
        respostas: null // Onde vamos salvar as escolhas finais do convidado
    };

    res.json({ sucesso: true, id: idUnico });
});

// Rota para carregar os dados do convite na tela do Convidado (index.html)
app.get('/api/convite/:id', (req, res) => {
    const convite = convites[req.params.id];
    if (!convite) return res.status(404).json({ erro: "Não encontrado" });
    
    // Retorna o nome e a ocasião para o index.html saber como se adaptar (e montar a agenda)
    res.json({ 
        nomeCriador: convite.nomeCriador,
        ocasiao: convite.ocasiao || 'date'
    });
});

// Rota para salvar a resposta e devolver o WhatsApp do criador (index.html)
app.post('/api/salvar-date/:id', (req, res) => {
    const id = req.params.id;
    // Recebe o objeto de seleções enviado pelo front-end
    const { date, time, food, activity } = req.body;

    if (!convites[id]) return res.status(404).json({ sucesso: false, erro: "Convite não encontrado." });

    // Salva as escolhas feitas dentro do objeto do convite
    convites[id].respostas = {
        date,
        time,
        food,
        activity,
        respondidoEm: new Date()
    };

    // Retorna os dados para o redirecionamento do WhatsApp e preenchimento da agenda funcionarem
    res.json({
        sucesso: true,
        nomeCriador: convites[id].nomeCriador,
        whatsappCriador: convites[id].whatsappCriador
    });
});

// Definição da porta dinâmica para o Render ou local
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando com sucesso na porta ${PORT}! ??`);
});