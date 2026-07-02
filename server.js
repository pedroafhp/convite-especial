// Carrega as variáveis de ambiente do arquivo oculto '.env' (usado apenas localmente)
require('dotenv').config();

// Importa o framework Express para gerenciar rotas HTTP e requisições
const express = require('express');

// Importa o ODM Mongoose para fazer a modelagem e conexão com o banco MongoDB
const mongoose = require('mongoose');

// Inicializa a aplicação Express
const app = express();

// Middleware que transforma o corpo das requisições (body) em objetos JSON legíveis pelo JavaScript
app.use(express.json());

// Middleware que serve arquivos estáticos (HTML, CSS, JS) de forma automática a partir da pasta 'public'
app.use(express.static('public')); 

// Armazena a string de conexão do banco de dados vinda do painel de controle do Render
const MONGODB_URI = process.env.MONGODB_URI;

// Verifica se a variável de ambiente não existe (acontece quando rodamos no PC local sem configurar o .env)
if (!MONGODB_URI) {
    console.log("?? AVISO: MONGODB_URI não detectada. Rodando com banco de dados local para testes.");
}

// Estabelece a conexão com a nuvem do MongoDB Atlas ou recorre ao banco local do computador
mongoose.connect(MONGODB_URI || 'mongodb://127.0.0.1:27017/convites_db')
    .then(() => console.log('Conectado ao MongoDB com sucesso! ??')) // Executado em caso de sucesso
    .catch(err => console.error('Erro crítico ao conectar ao MongoDB:', err)); // Captura falhas de conexão

// MODELO ATUALIZADO (SCHEMA): Suporta fluxos individuais e dinâmicas de votação em grupo via WhatsApp
const ConviteSchema = new mongoose.Schema({
    nomeCriador: String,       // Nome de quem gerou o link original (link do grupo)
    whatsappCriador: String,   // Número do criador para controle de envio/dados
    ocasiao: { type: String, default: 'date' }, // Tipo do evento (date, resenha, girls-night, etc.)
    
    // CAMPOS DE CONTROLE DO FORMATO:
    tipoConvite: { type: String, default: 'individual' }, // 'individual' ou 'grupo'
    permitirVotacao: { type: Boolean, default: true },   // Ativa sistema de contrapropostas
    
    // Lista acumulativa de respostas / votos recebidos dos amigos
    respostas: [{
        nomeParticipante: String, // Nome inserido pelo convidado
        date: String,             // Data escolhida (ou sugerida na contraproposta)
        time: String,             // Horário escolhido (ou sugerido na contraproposta)
        food: String,             // Comidas/bebidas marcadas por ele (string formatada ou array se tratar no front)
        activity: String,         // Atividades/vibe selecionadas por ele
        
        // CAMPOS DE VOTAÇÃO COLETIVA:
        votoConcorda: { type: Boolean, default: true }, // true = aceitou a proposta atual | false = abriu contraproposta
        
        respondidoEm: { type: Date, default: Date.now } // Data e hora automática do voto
    }]
});

// Compila a estrutura do Schema criando o modelo manipulável chamado 'Convite'
const Convite = mongoose.model('Convite', ConviteSchema);

// ROTA POST: Criação do link base do convite (Página criar.html)
// Note que agora ele apenas inicializa o link do grupo. O primeiro que acessar cria a proposta oficial.
app.post('/api/criar-convite', async (req, res) => {
    try {
        const nomeCriador = req.body.nomeCriador || (req.body.criador && req.body.criador.nome);
        const whatsappCriador = req.body.whatsappCriador || (req.body.criador && req.body.criador.contactInfo);
        const ocasiao = req.body.ocasiao || 'date'; 
        const tipoConvite = req.body.tipoConvite || 'individual';
        const permitirVotacao = req.body.permitirVotacao !== undefined ? req.body.permitirVotacao : true;

        if (!nomeCriador || !whatsappCriador) {
            return res.status(400).json({ sucesso: false, erro: "Dados incompletos." });
        }

        const novoConvite = new Convite({
            nomeCriador,
            whatsappCriador,
            ocasiao,
            tipoConvite,
            permitirVotacao,
            respostas: [] // Nasce completamente vazio para aguardar o primeiro acesso
        });

        await novoConvite.save();
        res.json({ sucesso: true, id: novoConvite.id });
    } catch (err) {
        console.error("Erro na rota /api/criar-convite:", err);
        res.status(500).json({ sucesso: false, erro: "Erro interno ao criar convite." });
    }
});

// ROTA GET: Carrega o contexto do rolê ao abrir o link do convidado (Página index.html)
app.get('/api/convite/:id', async (req, res) => {
    try {
        const convite = await Convite.findById(req.params.id);
        if (!convite) return res.status(404).json({ erro: "Não encontrado" });
        
        // Regra de Grupo Dinâmica: se o array de respostas estiver vazio, indica que ninguém sugeriu nada ainda
        const temSugestaoInicial = convite.tipoConvite === 'grupo' ? convite.respostas.length > 0 : true;

        res.json({ 
            nomeCriador: convite.nomeCriador,
            ocasiao: convite.ocasiao || 'date',
            tipoConvite: convite.tipoConvite || 'individual',
            permitirVotacao: convite.permitirVotacao,
            temSugestaoInicial: temSugestaoInicial, // Front-end usará isso para saber se abre direto o formulário de criação
            sugestaoAtual: temSugestaoInicial ? convite.respostas[0] : null, // A primeira resposta gravada vira o padrão oficial do grupo
            respostas: convite.respostas // Envia todo o histórico (inclusive as contrapropostas com nome de quem sugeriu)
        });
    } catch (err) {
        res.status(404).json({ erro: "Formato de ID inválido ou registro não encontrado." });
    }
});

// ROTA POST: Computa a resposta (Criadora inicial, aceitação ou contraproposta)
app.post('/api/salvar-date/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const { 
            nomeParticipante, 
            date, 
            time, 
            food, 
            activity, 
            votoConcorda 
        } = req.body;

        if (!nomeParticipante) {
            return res.status(400).json({ sucesso: false, erro: "O nome do participante é obrigatório." });
        }

        const novaResposta = {
            nomeParticipante,
            date,
            time,
            food,
            activity,
            votoConcorda: votoConcorda !== undefined ? votoConcorda : true,
            respondidoEm: new Date()
        };

        const conviteAtualizado = await Convite.findByIdAndUpdate(
            id,
            { $push: { respostas: novaResposta } },
            { new: true }
        );

        if (!conviteAtualizado) {
            return res.status(404).json({ sucesso: false, erro: "Convite não encontrado." });
        }

        res.json({
            sucesso: true,
            nomeCriador: conviteAtualizado.nomeCriador,
            whatsappCriador: conviteAtualizado.whatsappCriador,
            totalRespostas: conviteAtualizado.respostas.length
        });
    } catch (err) {
        console.error("Erro na rota /api/salvar-date:", err);
        res.status(500).json({ sucesso: false, erro: "Erro ao salvar respostas no servidor." });
    }
});

// Define a porta onde a aplicação vai escutar requisições
const PORT = process.env.PORT || 3000;

// Inicializa efetivamente os serviços do servidor web
app.listen(PORT, () => {
    console.log(`Servidor rodando com sucesso na porta ${PORT}! ??`);
});