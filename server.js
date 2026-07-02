// ======================================================
// CARREGAMENTO DAS DEPENDÊNCIAS
// ======================================================

// Carrega as variáveis de ambiente do arquivo oculto '.env'
// (utilizado apenas em ambiente local)
require('dotenv').config();

// Framework responsável pelas rotas HTTP
const express = require('express');

// ODM utilizado para conexão e modelagem do MongoDB
const mongoose = require('mongoose');

// Inicializa a aplicação Express
const app = express();


// ======================================================
// MIDDLEWARES GLOBAIS
// ======================================================

// Permite receber JSON no corpo das requisições
app.use(express.json());

// Permite servir arquivos da pasta "public"
app.use(express.static('public'));


// ======================================================
// CONEXÃO COM O MONGODB
// ======================================================

// Obtém a string de conexão das variáveis de ambiente
const MONGODB_URI = process.env.MONGODB_URI;

// Caso a variável não exista, utiliza o banco local
if (!MONGODB_URI) {
    console.log(
        "?? MONGODB_URI não encontrada. Utilizando banco local."
    );
}

// Realiza a conexão com o MongoDB Atlas ou local
mongoose.connect(
    MONGODB_URI || 'mongodb://127.0.0.1:27017/convites_db'
)
.then(() => {
    console.log('? Conectado ao MongoDB!');
})
.catch(err => {
    console.error(
        '? Erro ao conectar no MongoDB:',
        err
    );
});


// ======================================================
// SCHEMA PRINCIPAL DOS CONVITES
// ======================================================

const ConviteSchema = new mongoose.Schema({

    // Nome de quem criou o convite
    nomeCriador: String,

    // WhatsApp do criador
    // Utilizado para redirecionamento e confirmações
    whatsappCriador: String,

    // Tipo da ocasião:
    // date, resenha, girls-night ou outros
    ocasiao: {
        type: String,
        default: 'date'
    },

    // Título personalizado utilizado apenas
    // quando a ocasião for "outros"
    //
    // Exemplo:
    // "Boliche dos amigos"
    tituloPersonalizado: {
        type: String,
        default: ''
    },

    // Define se o convite é:
    // individual ou grupo
    tipoConvite: {
        type: String,
        default: 'individual'
    },

    // Define se o grupo pode criar
    // contrapropostas e votar
    permitirVotacao: {
        type: Boolean,
        default: true
    },


    // ==================================================
    // SISTEMA DE PROPOSTAS PARA GRUPOS
    // ==================================================
    //
    // Cada proposta representa uma sugestão de rolê
    // criada por algum participante.
    //
    // Exemplo:
    //
    // Sugestão de Pedro
    // ?? 10/07
    // ?? 20:00
    // ?? Pizza
    // ?? Cinema
    // ?? 5 votos
    //
    // ==================================================

    propostas: [{

        // Nome de quem criou a proposta
        autor: String,

        // Data sugerida
        date: String,

        // Horário sugerido
        time: String,

        // Lista de comidas e bebidas
        //
        // Exemplo:
        // ["Pizza", "Sushi", "Outros: Esfiha"]
        food: [String],

        // Lista de atividades e vibes
        //
        // Exemplo:
        // ["Cinema", "Karaokê"]
        activity: [String],

        // Lista de pessoas que votaram
        votos: [{

            // Nome do participante
            nomeParticipante: String,

            // Momento em que o voto foi realizado
            votadoEm: {
                type: Date,
                default: Date.now
            }

        }],

        // Data de criação da proposta
        criadaEm: {
            type: Date,
            default: Date.now
        }

    }],


    // ==================================================
    // SISTEMA ANTIGO DE RESPOSTAS
    // ==================================================
    //
    // ESTE BLOCO SERÁ MANTIDO
    // para não quebrar os convites individuais
    // nem perder compatibilidade com versões antigas.
    //
    // ==================================================

    respostas: [{

        // Nome do participante
        nomeParticipante: String,

        // Data escolhida
        date: String,

        // Horário escolhido
        time: String,

        // Comidas selecionadas
        //
        // Mantido como String para compatibilidade
        food: String,

        // Atividades selecionadas
        //
        // Mantido como String para compatibilidade
        activity: String,

        // Indica se a pessoa concordou
        // com a proposta atual
        votoConcorda: {
            type: Boolean,
            default: true
        },

        // Índice da proposta escolhida
        //
        // Utilizado apenas em grupos
        propostaEscolhida: Number,

        // Momento em que a resposta foi enviada
        respondidoEm: {
            type: Date,
            default: Date.now
        }

    }]
});


// Compila o schema criando o model "Convite"
const Convite = mongoose.model(
    'Convite',
    ConviteSchema
);


// ======================================================
// ROTA: CRIAR CONVITE
// ======================================================
//
// Responsável por:
//
// • Criar convites individuais
// • Criar convites em grupo
// • Salvar título personalizado
// • Salvar proposta inicial do grupo
//
// ======================================================

app.post('/api/criar-convite', async (req, res) => {

    try {

        // Extrai os dados enviados pelo front-end
        const {

            nomeCriador,
            whatsappCriador,

            ocasiao,

            tituloPersonalizado,

            tipoConvite,

            permitirVotacao,

            propostaInicial

        } = req.body;


        // Validação básica
        if (!nomeCriador || !whatsappCriador) {

            return res.status(400).json({

                sucesso: false,

                erro: 'Dados incompletos.'

            });

        }


        // Cria o objeto principal do convite
        const novoConvite = new Convite({

            nomeCriador,

            whatsappCriador,

            ocasiao: ocasiao || 'date',

            tituloPersonalizado:
                tituloPersonalizado || '',

            tipoConvite:
                tipoConvite || 'individual',

            permitirVotacao:
                permitirVotacao !== undefined
                    ? permitirVotacao
                    : true,

            // Inicialmente vazio
            propostas: [],

            // Mantido para compatibilidade
            respostas: []

        });


        // ==================================================
        // PROPOSTA INICIAL (APENAS PARA GRUPOS)
        // ==================================================

        if (
            tipoConvite === 'grupo'
            &&
            propostaInicial
        ) {

            novoConvite.propostas.push({

                // O criador é automaticamente
                // o autor da primeira proposta
                autor: nomeCriador,

                date:
                    propostaInicial.date,

                time:
                    propostaInicial.time,

                food:
                    propostaInicial.food || [],

                activity:
                    propostaInicial.activity || [],

                // O criador já nasce
                // com o primeiro voto
                votos: [{

                    nomeParticipante:
                        nomeCriador

                }]

            });

        }


        // Salva no MongoDB
        await novoConvite.save();


        // Retorna o ID do convite
        res.json({

            sucesso: true,

            id: novoConvite.id

        });

    }
    catch (err) {

        console.error(
            'Erro ao criar convite:',
            err
        );

        res.status(500).json({

            sucesso: false,

            erro:
                'Erro interno do servidor.'

        });

    }

});


// ======================================================
// ROTA: OBTER DADOS DO CONVITE
// ======================================================
//
// Utilizada pelo index.html
//
// Retorna:
//
// • Dados do criador
// • Tipo do convite
// • Propostas do grupo
// • Respostas do sistema antigo
//
// ======================================================

app.get('/api/convite/:id', async (req, res) => {

    try {

        // Busca o convite pelo ID
        const convite =
            await Convite.findById(
                req.params.id
            );


        // Caso não exista
        if (!convite) {

            return res.status(404).json({

                erro:
                    'Convite não encontrado.'

            });

        }


        // Define se existe
        // uma proposta inicial cadastrada
        const temSugestaoInicial =

            convite.tipoConvite === 'grupo'

                ? convite.propostas.length > 0

                : true;


        // Retorna todas as informações
        res.json({

            nomeCriador:
                convite.nomeCriador,

            whatsappCriador:
                convite.whatsappCriador,

            ocasiao:
                convite.ocasiao,

            tituloPersonalizado:
                convite.tituloPersonalizado,

            tipoConvite:
                convite.tipoConvite,

            permitirVotacao:
                convite.permitirVotacao,

            temSugestaoInicial,

            // Primeira sugestão criada
            sugestaoAtual:
                convite.propostas[0] || null,

            // Todas as propostas
            propostas:
                convite.propostas,

            // Sistema legado
            respostas:
                convite.respostas

        });

    }
    catch (err) {

        res.status(404).json({

            erro:
                'Convite não encontrado.'

        });

    }

});

// ======================================================
// ROTA: SALVAR RESPOSTA DO CONVITE INDIVIDUAL
// ======================================================
//
// Esta rota permanece praticamente igual ao sistema atual.
//
// Ela é utilizada apenas pelos convites individuais,
// onde o convidado escolhe:
//
// • Data
// • Horário
// • Comidas/Bebidas
// • Atividades
//
// ======================================================

app.post('/api/salvar-date/:id', async (req, res) => {

    try {

        const id = req.params.id;

        const {

            nomeParticipante,
            date,
            time,
            food,
            activity

        } = req.body;


        // Validação básica
        if (!nomeParticipante) {

            return res.status(400).json({

                sucesso: false,

                erro:
                    "O nome do participante é obrigatório."

            });

        }


        // Monta o objeto de resposta
        const novaResposta = {

            nomeParticipante,

            date,

            time,

            food,

            activity,

            // Individual sempre concorda
            votoConcorda: true,

            respondidoEm: new Date()

        };


        // Adiciona no array de respostas
        const conviteAtualizado =
            await Convite.findByIdAndUpdate(

                id,

                {
                    $push: {
                        respostas: novaResposta
                    }
                },

                {
                    new: true
                }

            );


        // Caso não exista
        if (!conviteAtualizado) {

            return res.status(404).json({

                sucesso: false,

                erro:
                    "Convite não encontrado."

            });

        }


        // Retorna sucesso
        res.json({

            sucesso: true,

            nomeCriador:
                conviteAtualizado.nomeCriador,

            whatsappCriador:
                conviteAtualizado.whatsappCriador,

            totalRespostas:
                conviteAtualizado.respostas.length

        });

    }
    catch (err) {

        console.error(
            "Erro em /api/salvar-date:",
            err
        );

        res.status(500).json({

            sucesso: false,

            erro:
                "Erro ao salvar resposta."

        });

    }

});


// ======================================================
// ROTA: CRIAR NOVA PROPOSTA (GRUPOS)
// ======================================================
//
// Utilizada quando alguém clicar:
//
// [? CRIAR NOVA SUGESTÃO]
//
// A proposta nasce automaticamente
// com 1 voto do autor.
//
// ======================================================

app.post('/api/criar-proposta/:id', async (req, res) => {

    try {

        const {

            nomeParticipante,

            date,

            time,

            food,

            activity

        } = req.body;


        // Busca o convite
        const convite =
            await Convite.findById(
                req.params.id
            );


        if (!convite) {

            return res.status(404).json({

                sucesso: false,

                erro:
                    "Convite não encontrado."

            });

        }


        // Cria a nova proposta
        convite.propostas.push({

            autor:
                nomeParticipante,

            date,

            time,

            food: food || [],

            activity: activity || [],

            // O autor já vota automaticamente
            votos: [{

                nomeParticipante

            }]

        });


        // Salva no banco
        await convite.save();


        // Retorna sucesso
        res.json({

            sucesso: true,

            totalPropostas:
                convite.propostas.length

        });

    }
    catch (err) {

        console.error(
            "Erro ao criar proposta:",
            err
        );

        res.status(500).json({

            sucesso: false,

            erro:
                "Erro interno."

        });

    }

});


// ======================================================
// ROTA: VOTAR EM UMA PROPOSTA
// ======================================================
//
// Utilizada quando alguém clicar:
//
// [VOTAR NESTA OPÇÃO]
//
// ======================================================

app.post('/api/votar/:id/:propostaId', async (req, res) => {

    try {

        const {

            nomeParticipante

        } = req.body;


        // Busca o convite
        const convite =
            await Convite.findById(
                req.params.id
            );


        if (!convite) {

            return res.status(404).json({

                sucesso: false,

                erro:
                    "Convite não encontrado."

            });

        }


        // Obtém a proposta
        const proposta =

            convite.propostas[
                req.params.propostaId
            ];


        if (!proposta) {

            return res.status(404).json({

                sucesso: false,

                erro:
                    "Proposta não encontrada."

            });

        }


        // ==================================================
        // EVITA VOTOS DUPLICADOS
        // ==================================================

        const jaVotou =

            proposta.votos.some(v =>

                v.nomeParticipante ===
                nomeParticipante

            );


        if (jaVotou) {

            return res.json({

                sucesso: true,

                mensagem:
                    "Participante já votou.",

                votos:
                    proposta.votos.length

            });

        }


        // Registra o voto
        proposta.votos.push({

            nomeParticipante

        });


        // Mantém compatibilidade
        // com o sistema antigo
        convite.respostas.push({

            nomeParticipante,

            votoConcorda: true,

            propostaEscolhida:
                Number(req.params.propostaId),

            respondidoEm:
                new Date()

        });


        // Salva alterações
        await convite.save();


        // Retorna total atualizado
        res.json({

            sucesso: true,

            votos:
                proposta.votos.length

        });

    }
    catch (err) {

        console.error(
            "Erro ao votar:",
            err
        );

        res.status(500).json({

            sucesso: false,

            erro:
                "Erro ao registrar voto."

        });

    }

});


// ======================================================
// INICIALIZAÇÃO DO SERVIDOR
// ======================================================

// Porta utilizada pelo Render ou localmente
const PORT = process.env.PORT || 3000;


// Inicia o servidor
app.listen(PORT, () => {

    console.log(
        `?? Servidor rodando na porta ${PORT}!`
    );

});