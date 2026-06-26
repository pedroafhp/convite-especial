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

// MODELO ATUALIZADO (SCHEMA): Suporta fluxos individuais e dinâmicas de votação em grupo
const ConviteSchema = new mongoose.Schema({
    nomeCriador: String,       // Nome de quem gerou o link do evento
    whatsappCriador: String,   // Número do criador para controle de envio/dados
    ocasiao: { type: String, default: 'date' }, // Tipo do evento (date, resenha, girls-night, etc.)
    
    // NOVOS CAMPOS PARA GRUPO:
    tipoConvite: { type: String, default: 'individual' }, // 'individual' ou 'grupo'
    permitirVotacao: { type: Boolean, default: true },   // Ativa sistema de contrapropostas
    emailsGrupo: { type: String, default: '' },          // String crua com e-mails dos participantes
    
    // Lista acumulativa de respostas / votos recebidos
    respostas: [{
        nomeParticipante: String, // Nome ou apelido inserido pelo convidado na nova tela
        date: String,             // Data escolhida ou aceita
        time: String,             // Horário escolhido ou aceito
        food: String,             // Comidas/bebidas marcadas por ele
        activity: String,         // Atividades/vibe selecionadas por ele
        
        // NOVOS CAMPOS DE VOTAÇÃO:
        votoConcorda: { type: Boolean, default: true }, // true = aceitou sugestão anterior | false = contraproposta
        sugestaoAlternativa: { type: String, default: '' }, // Caso recuse, detalha o que sugere de novo
        
        respondidoEm: { type: Date, default: Date.now } // Data e hora automática do voto
    }]
});

// Compila a estrutura do Schema criando o modelo manipulável chamado 'Convite'
const Convite = mongoose.model('Convite', ConviteSchema);

// ROTA POST: Criação do convite base (Página criar.html)
app.post('/api/criar-convite', async (req, res) => {
    try {
        // Captura os dados do criador aceitando variações de nomenclatura enviadas pelo frontend
        const nomeCriador = req.body.nomeCriador || (req.body.criador && req.body.criador.nome);
        const whatsappCriador = req.body.whatsappCriador || (req.body.criador && req.body.criador.contactInfo);
        const ocasiao = req.body.ocasiao || 'date'; 
        
        // NOVOS PARAMETROS: Resgata as preferências estruturadas do formato de grupo
        const tipoConvite = req.body.tipoConvite || 'individual';
        const permitirVotacao = req.body.permitirVotacao !== undefined ? req.body.permitirVotacao : true;
        const emailsGrupo = req.body.emailsGrupo || '';

        // Barra a execução se os parâmetros vitais não forem encaminhados no corpo da requisição
        if (!nomeCriador || !whatsappCriador) {
            return res.status(400).json({ sucesso: false, erro: "Dados incompletos." });
        }

        // Instancia um novo documento no banco incluindo as propriedades configuradas para grupos ou individuais
        const novoConvite = new Convite({
            nomeCriador,
            whatsappCriador,
            ocasiao,
            tipoConvite,
            permitirVotacao,
            emailsGrupo
        });

        // Grava fisicamente as informações na coleção correspondente do MongoDB Atlas
        await novoConvite.save();

        // Responde ao criador fornecendo o ID hexadecimal exclusivo gerado de forma automática pelo banco
        res.json({ sucesso: true, id: novoConvite.id });
    } catch (err) {
        console.error("Erro na rota /api/criar-convite:", err);
        res.status(500).json({ sucesso: false, erro: "Erro interno ao criar convite." });
    }
});

// ROTA GET: Carrega o contexto do rolê ao abrir o link do convidado (Página index.html)
app.get('/api/convite/:id', async (req, res) => {
    try {
        // Resgata o documento correspondente ao ID informado na barra de endereços (:id)
        const convite = await Convite.findById(req.params.id);
        
        // Se o ID não existir na base de dados, encerra com o status HTTP 404 (Não Encontrado)
        if (!convite) return res.status(404).json({ erro: "Não encontrado" });
        
        // ATUALIZADO: Devolve as regras do grupo e o histórico de respostas para montar a timeline/votação
        res.json({ 
            nomeCriador: convite.nomeCriador,
            ocasiao: convite.ocasiao || 'date',
            tipoConvite: convite.tipoConvite || 'individual',
            permitirVotacao: convite.permitirVotacao,
            emailsGrupo: convite.emailsGrupo,
            respostas: convite.respostas // Envia o array para o front renderizar as escolhas anteriores
        });
    } catch (err) {
        // Trata erros de conversão de ID (caso digitem caracteres inválidos no parâmetro da URL)
        res.status(404).json({ erro: "Formato de ID inválido ou registro não encontrado." });
    }
});

// ROTA POST ATUALIZADA: Computa a resposta (seja voto individual padrão, aceitação de grupo ou contraproposta)
app.post('/api/salvar-date/:id', async (req, res) => {
    try {
        const id = req.params.id; // Extrai o ID do convite a partir dos parâmetros da URL
        
        // Desestrutura os parâmetros mapeados incluindo os novos controles de fluxo de votação
        const { 
            nomeParticipante, 
            date, 
            time, 
            food, 
            activity, 
            votoConcorda, 
            sugestaoAlternativa 
        } = req.body;

        // Validação preventiva de segurança exigindo a assinatura do participante
        if (!nomeParticipante) {
            return res.status(400).json({ sucesso: false, erro: "O nome do participante é obrigatório." });
        }

        // Monta o novo objeto de resposta de maneira condicional e flexível
        const novaResposta = {
            nomeParticipante,
            date,
            time,
            food,
            activity,
            votoConcorda: votoConcorda !== undefined ? votoConcorda : true,
            sugestaoAlternativa: sugestaoAlternativa || '',
            respondidoEm: new Date() // Marca o carimbo de data/hora atual da resposta
        };

        // Localiza e atualiza o documento aplicando a modificação via operador $push
        const conviteAtualizado = await Convite.findByIdAndUpdate(
            id,
            {
                // OPERADOR $push: "Empurra" o objeto construído para dentro do Array histórico de respostas
                $push: { respostas: novaResposta }
            },
            { new: true } // Retorna o documento modificado pós-atualização para análise
        );

        // Retorna erro se o ID do convite acessado tiver sido deletado ou digitado errado
        if (!conviteAtualizado) {
            return res.status(404).json({ sucesso: false, erro: "Convite não encontrado." });
        }

        // Responde com metadados do criador e o estado atualizado do array de respostas
        res.json({
            sucesso: true,
            nomeCriador: conviteAtualizado.nomeCriador,
            whatsappCriador: conviteAtualizado.whatsappCriador,
            totalRespostas: conviteAtualizado.respostas.length // Útil para o front saber o tamanho do grupo atual
        });
    } catch (err) {
        console.error("Erro na rota /api/salvar-date:", err);
        res.status(500).json({ sucesso: false, erro: "Erro ao salvar respostas no servidor." });
    }
});

// Define a porta onde a aplicação vai escutar requisições (A porta do Render é dinâmica, localmente assume a 3000)
const PORT = process.env.PORT || 3000;

// Inicializa efetivamente os serviços do servidor web
app.listen(PORT, () => {
    console.log(`Servidor rodando com sucesso na porta ${PORT}! ??`);
});