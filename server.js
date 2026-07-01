const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
// Servir arquivos estáticos da pasta 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Banco de dados temporário em memória (Substitua por MongoDB/PostgreSQL em produção)
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
        respostas: [],
        sugestaoAtual: {
            dataHora: "01/07/2026 às 21:00",
            comidaBebida: "Churrasco, Cerveja/Drinks",
            vibe: "Ouvir Som, Assistir Jogo"
        }
    };

    res.json({ sucesso: true, id });
});

// API para buscar detalhes de um convite específico
app.get('/api/convite/:id', (req, res) => {
    const convite = convitesDB[req.params.id];
    if (!convite) {
        return res.status(404).json({ sucesso: false, erro: 'Convite não encontrado.' });
    }
    res.json({ sucesso: true, convite });
});

// API para salvar respostas/votações
app.post('/api/convite/:id/responder', (req, res) => {
    const convite = convitesDB[req.params.id];
    if (!convite) return res.status(404).json({ sucesso: false });
    
    const { nome, status, contraproposta } = req.body;
    convite.respostas.push({ nome, status, contraproposta });
    
    res.json({ sucesso: true });
});

// Rota Inteligente: Direciona para o fluxo correto com base no tipo do convite
app.get('/convite/:id', (req, res) => {
    const convite = convitesDB[req.params.id];
    if (!convite) {
        return res.status(404).send('<h1>Convite não encontrado ou expirado! ??</h1>');
    }

    // Entrega o HTML correto dependendo do tipo guardado no banco
    if (convite.tipoConvite === 'grupo') {
        res.sendFile(path.join(__dirname, 'public', 'grupo.html'));
    } else {
        res.sendFile(path.join(__dirname, 'public', 'individual.html'));
    }
});

app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));