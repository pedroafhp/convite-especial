// Carrega as variáveis de ambiente do arquivo oculto '.env' (usado apenas localmente)
require('dotenv').config();

// Importa o framework Express para gerenciar rotas HTTP e requisições
const express = require('express');

// Importa o ODM Mongoose para fazer a modelagem e conexão com o banco MongoDB
const mongoose = require('mongoose');

// Importa o módulo nativo path para manipulação correta e segura de caminhos de arquivos
const path = require('path');

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

// MODELO DE DADOS ATUALIZADO (SCHEMA)
const ConviteSchema = new mongoose.Schema({
    nomeCriador: String,       // Nome de quem gerou o link original
    whatsappCriador: String,   // Número do criador para controle de envio/dados
    ocasiao: { type: String, default: 'date' }, // Tipo do evento (date, resenha, girls-night, etc.)
    tipoConvite: { type: String, default: 'individual' }, // 'individual' ou 'grupo'
    permitirVotacao: { type: Boolean, default: true },   // Ativa sistema de contrapropostas
    
    // Lista acumulativa de respostas / votos recebidos dos convidados
    respostas: [{
        nomeParticipante: String, // Nome inserido pelo convidado
        date: String,             // Data escolhida/sugerida
        time: String,             // Horário escolhido/sugerida
        food: String,             // Comidas/bebidas marcadas por ele
        activity: String,         // Atividades/vibe selecionadas por ele
        votoConcorda: { type: Boolean, default: true }, // true = aceitou a proposta atual | false = abriu contraproposta
        respondidoEm: { type: Date, default: Date.now } // Data e hora automática do voto
    }]
});

// Compila a estrutura do Schema criando o modelo manipulável chamado 'Convite'
const Convite = mongoose.model('Convite', ConviteSchema);


/* ==========================================================================
   ROTAS DE NAVEGAÇÃO INTERNA (DIRECIONAMENTO INTELIGENTE DE TELAS)
   ========================================================================== */

// Rota principal que o convidado acessa pelo navegador (Ex: https://seusite.com/convite/ID_AQUI)
app.get('/convite/:id', async (req, res) => {
    try {
        const convite = await Convite.findById(req.params.id);
        if (!convite) {
            return res.status(404).send("<h1>Convite não encontrado ou link expirado. ??</h1>");
        }

        // Se o convite for do tipo individual, entrega a tela específica individual
        if (convite.tipoConvite === 'individual') {
            return res.sendFile(path.join(__dirname, 'public', 'individual.html'));
        } 
        
        // Se for de grupo, entrega a tela específica de grupo
        return res.sendFile(path.join(__dirname, 'public', 'grupo.html'));

    } catch (err) {
        console.error("Erro ao carregar renderização do convite:", err);
        res.status(400).send("<h1>ID de convite inválido ou malformado.</h1>");
    }
});


/* ==========================================================================
   ROTAS DE ENDPOINTS E APIS (INTERAÇÃO COM O BANCO DE DADOS)
   ========================================================================== */

// 1. ROTA POST: Criação do link base do convite (Página criar.html)
app.post('/api/criar-convite', async (req, res) => {
    try {
        const nomeCriador = req.body.nomeCriador;
        const whatsappCriador = req.body.whatsappCriador;
        const ocasiao = req.body.ocasiao || 'date'; 
        const tipoConvite = req.body.tipoConvite || 'individual';
        const permitirVotacao = req.body.permitirVotacao !== undefined ? req.body.permitirVotacao : true;

        if (!nomeCriador || !whatsappCriador) {
            return res.status(400).json({ sucesso: false, erro: "Nome e WhatsApp do criador são obrigatórios." });
        }

        const novoConvite = new Convite({
            nomeCriador,
            whatsappCriador,
            ocasiao,
            tipoConvite,
            permitirVotacao,
            respostas: [] 
        });

        await novoConvite.save();
        
        // Retorna o link completo estruturado com o domínio dinâmico do servidor
        const linkCompleto = `${req.protocol}://${req.get('host')}/convite/${novoConvite._id}`;
        
        res.json({ sucesso: true, id: novoConvite._id, linkConvite: linkCompleto });
    } catch (err) {
        console.error("Erro na rota /api/criar-convite:", err);
        res.status(500).json({ sucesso: false, erro: "Erro interno ao criar convite." });
    }
});

// 2. ROTA GET: Busca todos os dados mapeados para alimentar dinamicamente os fronts
app.get('/api/obter-convite/:id', async (req, res) => {
    try {
        const convite = await Convite.findById(req.params.id);
        if (!convite) return res.status(404).json({ sucesso: false, erro: "Convite não localizado" });
        
        // Filtra a lista para extrair os votos válidos que apenas concordaram com as propostas atuais
        const votosConcordantes = convite.respostas.filter(r => r.votoConcorda === true);
        
        // Encontra a última contraproposta enviada por alguém para ser a proposta oficial do painel do grupo
        const ultimaContraproposta = [...convite.respostas].reverse().find(r => r.votoConcorda === false);

        // Se houver uma contraproposta, ela vira a principal do grupo. Se não, fica como "A definir" até alguém propor
        const propostaAtual = ultimaContraproposta ? {
            dataHora: `${ultimaContraproposta.date} às ${ultimaContraproposta.time}`,
            comida: ultimaContraproposta.food,
            vibe: ultimaContraproposta.activity
        } : null;

        // Formata a lista de respostas legíveis para o histórico do grupo
        const respostasGrupo = convite.respostas.map(resp => ({
            nomeUser: resp.nomeParticipante,
            tipoAction: resp.votoConcorda ? 'concordou' : 'propos',
            txtFeedback: resp.votoConcorda 
                ? "Confirmou presença na proposta atual" 
                : `Sugeriu nova data (${resp.date} às ${resp.time})`
        }));

        res.json({ 
            sucesso: true,
            convite: {
                nomeCriador: convite.nomeCriador,
                whatsappCriador: convite.whatsappCriador,
                ocasiao: convite.ocasiao,
                tipoConvite: convite.tipoConvite,
                permitirVotacao: convite.permitirVotacao,
                propostaAtual: propostaAtual,
                respostasGrupo: respostasGrupo
            }
        });
    } catch (err) {
        res.status(400).json({ sucesso: false, erro: "ID inválido." });
    }
});

// 3. ROTA POST: Computa voto de aceite sem alterar as configurações originais (Botão Concordo)
app.post('/api/convite/:id/votar', async (req, res) => {
    try {
        const { nomeUser, tipoAction } = req.body;
        if (!nomeUser) return res.status(400).json({ sucesso: false, erro: "Nome obrigatório." });

        const novoVoto = {
            nomeParticipante: nomeUser,
            votoConcorda: tipoAction === 'concordou',
            date: "Mantido", time: "Mantido", food: "Mantido", activity: "Mantido"
        };

        const atualizado = await Convite.findByIdAndUpdate(
            req.params.id,
            { $push: { respostas: novoVoto } },
            { new: true }
        );

        if (!atualizado) return res.status(404).json({ sucesso: false, erro: "Não encontrado." });
        res.json({ sucesso: true });
    } catch (err) {
        res.status(500).json({ sucesso: false, erro: "Erro ao computar voto." });
    }
});

// 4. ROTA POST: Cria uma nova proposta/personalização de plano no banco de dados (Contraproposta ou Fluxo Individual)
app.post('/api/convite/:id/propor', async (req, res) => {
    try {
        const { nomeUser, tipoConvite, dataHora, comida, vibe } = req.body;
        
        // Destrincha a string recebida "DD/MM/AAAA às HH:MM" de volta para os campos do Schema
        let dataFinal = "A definir";
        let horaFinal = "A definir";
        if (dataHora && dataHora.includes(" às ")) {
            const partes = dataHora.split(" às ");
            dataFinal = partes[0];
            horaFinal = partes[1];
        }

        const novaProposta = {
            nomeParticipante: nomeUser || "Convidado",
            date: dataFinal,
            time: horaFinal,
            food: comida || "A definir",
            activity: vibe || "A definir",
            // Se for individual, conta como aceite direto (true). Se for grupo alterando, conta como contraproposta (false)
            votoConcorda: tipoConvite === 'individual' ? true : false 
        };

        const atualizado = await Convite.findByIdAndUpdate(
            req.params.id,
            { $push: { respostas: novaProposta } },
            { new: true }
        );

        if (!atualizado) return res.status(404).json({ sucesso: false, erro: "Não encontrado." });
        res.json({ sucesso: true });
    } catch (err) {
        res.status(500).json({ sucesso: false, erro: "Erro ao salvar proposta." });
    }
});


// Define a porta onde a aplicação vai escutar requisições
const PORT = process.env.PORT || 3000;

// Inicializa efetivamente os serviços do servidor web
app.listen(PORT, () => {
    console.log(`Servidor rodando com sucesso na porta ${PORT}! ??`);
});