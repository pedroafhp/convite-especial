const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Banco de dados em memória temporário
const convitesDB = {};

// API para criar o convite
app.post('/api/criar-convite', (req, res) => {
    const { nomeCriador, whatsappCriador, ocasiao, tipoConvite, permitirVotacao } = req.body;
    
    if (!nomeCriador || !whatsappCriador) {
        return res.status(400).json({ sucesso: false, erro: 'Nome e WhatsApp são obrigatórios.' });
    }

    const id = Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
    
    convitesDB[id] = {
        id,
        nomeCriador,
        whatsappCriador,
        ocasiao,
        tipoConvite,
        permitirVotacao,
        respostas: [], // Guarda quem votou e o que escolheu
        sugestaoAtual: {
            dataHora: "Sexta às 20h",
            comidaBebida: "Pizzas e Bebidas",
            vibe: "Conversar e Curtir Som"
        }
    };

    res.json({ sucesso: true, id });
});

// API para buscar os detalhes do convite
app.get('/api/convite/:id', (req, res) => {
    const convite = convitesDB[req.params.id];
    if (!convite) {
        return res.status(404).json({ sucesso: false, erro: 'Convite não encontrado.' });
    }
    res.json({ sucesso: true, convite });
});

// API para responder/votar no convite
app.post('/api/convite/:id/responder', (req, res) => {
    const convite = convitesDB[req.params.id];
    if (!convite) return res.status(404).json({ sucesso: false, erro: 'Convite não encontrado.' });
    
    const { nome, status, contraproposta } = req.body;
    
    convite.respostas.push({ nome, status, contraproposta });
    
    // Se for uma contraproposta válida, atualiza a sugestão principal do grupo
    if (status === 'contraproposta' && contraproposta) {
        convite.sugestaoAtual = {
            dataHora: contraproposta.dataHora || convite.sugestaoAtual.dataHora,
            comidaBebida: contraproposta.comidaBebida || convite.sugestaoAtual.comidaBebida,
            vibe: contraproposta.vibe || convite.sugestaoAtual.vibe
        };
    }
    
    res.json({ sucesso: true });
});

// Rota Amigável: Qualquer acesso a /convite/ID abre o index.html original com estilo intacto
app.get('/convite/:id', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`Servidor rodando a porta ${PORT}`));