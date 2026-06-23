const express = require('express');
const app = express();

app.use(express.json());
app.use(express.static('public')); // Serve os arquivos da pasta 'public'

// Banco de dados em memória simplificado
const convites = {};

// Rota para criar o convite (criar.html)
app.post('/api/criar-convite', (req, res) => {
    // Pegando os dados direto ou de dentro do objeto 'criador' (para dar suporte a ambos)
    const nomeCriador = req.body.nomeCriador || (req.body.criador && req.body.criador.nome);
    const whatsappCriador = req.body.whatsappCriador || (req.body.criador && req.body.criador.contactInfo);

    if (!nomeCriador || !whatsappCriador) {
        return res.status(400).json({ sucesso: false, erro: "Dados incompletos." });
    }

    // Gera um ID simples usando o timestamp atual
    const idUnico = Date.now().toString();

    convites[idUnico] = {
        nomeCriador,
        whatsappCriador,
        respostasDate: null // Onde vamos salvar as escolhas do date
    };

    res.json({ sucesso: true, id: idUnico });
});

// Rota para carregar o nome do criador na tela do Convidado (index.html)
app.get('/api/convite/:id', (req, res) => {
    const convite = convites[req.params.id];
    if (!convite) return res.status(404).json({ erro: "Não encontrado" });
    
    res.json({ nomeCriador: convite.nomeCriador });
});

// Rota para salvar a resposta e devolver o WhatsApp do criador (index.html - Tela 6)
// ATENÇÃO: Mudamos a rota para /api/salvar-date/:id para bater exatamente com o fetch do seu index.html
app.post('/api/salvar-date/:id', (req, res) => {
    const id = req.params.id;
    // Recebe exatamente o objeto dateSelections enviado pelo front-end
    const { date, time, food, activity } = req.body;

    if (!convites[id]) return res.status(404).json({ sucesso: false, erro: "Convite não encontrado." });

    // Salva o combo completo de escolhas dentro do convite
    convites[id].respostasDate = {
        date,
        time,
        food,
        activity,
        respondidoEm: new Date()
    };

    // Retorna os dados originais do Criador para o redirecionamento funcionar no front-end
    res.json({
        sucesso: true,
        nomeCriador: convites[id].nomeCriador,
        whatsappCriador: convites[id].whatsappCriador
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando com sucesso na porta ${PORT}! ??`);
});