const express = require('express');
const mongoose = require('mongoose');
const app = express();

app.use(express.json());
app.use(express.static('public')); // Serve os arquivos da pasta 'public'

// Conexão com o MongoDB (Local ou Nuvem via Variável de Ambiente)
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/convites_db';
mongoose.connect(MONGODB_URI)
    .then(() => console.log('Conectado ao MongoDB com sucesso! ??'))
    .catch(err => console.error('Erro ao conectar ao MongoDB:', err));

// Definição do Modelo (Schema) do Convite para o Banco de Dados
const ConviteSchema = new mongoose.Schema({
    nomeCriador: String,
    whatsappCriador: String,
    ocasiao: { type: String, default: 'date' },
    respostas: {
        date: String,
        time: String,
        food: String,
        activity: String,
        respondidoEm: Date
    }
});

const Convite = mongoose.model('Convite', ConviteSchema);

// Rota para criar o convite (criar.html)
app.post('/api/criar-convite', async (req, res) => {
    try {
        const nomeCriador = req.body.nomeCriador || (req.body.criador && req.body.criador.nome);
        const whatsappCriador = req.body.whatsappCriador || (req.body.criador && req.body.criador.contactInfo);
        const ocasiao = req.body.ocasiao || 'date'; 

        if (!nomeCriador || !whatsappCriador) {
            return res.status(400).json({ sucesso: false, erro: "Dados incompletos." });
        }

        // Salva um novo documento no MongoDB (o ID é gerado automaticamente como _id)
        const novoConvite = new Convite({
            nomeCriador,
            whatsappCriador,
            ocasiao
        });

        await novoConvite.save();

        // Retorna o ID gerado pelo MongoDB (.id mapeia o _id para string)
        res.json({ sucesso: true, id: novoConvite.id });
    } catch (err) {
        res.status(500).json({ sucesso: false, erro: "Erro interno ao criar convite." });
    }
});

// Rota para carregar os dados do convite na tela do Convidado (index.html)
app.get('/api/convite/:id', async (req, res) => {
    try {
        // Busca o convite pelo ID do MongoDB
        const convite = await Convite.findById(req.params.id);
        if (!convite) return res.status(404).json({ erro: "Não encontrado" });
        
        res.json({ 
            nomeCriador: convite.nomeCriador,
            ocasiao: convite.ocasiao || 'date'
        });
    } catch (err) {
        res.status(404).json({ erro: "Formato de ID inválido ou não encontrado." });
    }
});

// Rota para salvar a resposta e devolver o WhatsApp do criador (index.html)
app.post('/api/salvar-date/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const { date, time, food, activity } = req.body;

        // Atualiza as respostas do convite correspondente no banco de dados
        const conviteAtualizado = await Convite.findByIdAndUpdate(
            id,
            {
                respostas: {
                    date,
                    time,
                    food,
                    activity,
                    respondidoEm: new Date()
                }
            },
            { new: true } // Retorna o documento já modificado
        );

        if (!conviteAtualizado) {
            return res.status(404).json({ sucesso: false, erro: "Convite não encontrado." });
        }

        res.json({
            sucesso: true,
            nomeCriador: conviteAtualizado.nomeCriador,
            whatsappCriador: conviteAtualizado.whatsappCriador
        });
    } catch (err) {
        res.status(500).json({ sucesso: false, erro: "Erro ao salvar respostas." });
    }
});

// Definição da porta dinâmica para o Render ou local
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando com sucesso na porta ${PORT}! ??`);
});