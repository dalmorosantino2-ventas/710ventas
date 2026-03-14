require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, REST, Routes } = require("discord.js");
const fs = require('fs');

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
});

// --- CONFIGURACIÓN DE IDS ---
const CANAL_LOGS_ID = "1482226695397441668"; // Cambia esto por el ID de tu canal de logs
const ROL_PERMITIDO_ID = "1482226736899952660"; // El rol que me pasaste

// --- REGISTRO DEL COMANDO /gensteam ---
const commands = [
    new SlashCommandBuilder()
        .setName('gensteam')
        .setDescription('Genera cuentas de Steam desde el archivo .txt')
        .addIntegerOption(option => 
            option.setName('cantidad')
                .setDescription('Número de cuentas a generar')
                .setRequired(true))
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
    try {
        console.log('Cargando comandos /...');
        // Pon el ID de tu bot aquí abajo
        await rest.put(Routes.applicationCommands("1479205943655923976"), { body: commands });
    } catch (error) { console.error(error); }
})();

// --- LÓGICA DEL COMANDO ---
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'gensteam') {
        
        // 1. Verificar si tiene el ROL específico
        if (!interaction.member.roles.cache.has(ROL_PERMITIDO_ID)) {
            return interaction.reply({ 
                content: "❌ No tienes el rol necesario para generar cuentas.", 
                ephemeral: true 
            });
        }

        const cantidad = interaction.options.getInteger('cantidad');
        const logsChannel = client.channels.cache.get(CANAL_LOGS_ID);

        // 2. Leer el archivo txt
        if (!fs.existsSync('cuentas.txt')) {
            return interaction.reply({ content: "❌ El archivo cuentas.txt no existe.", ephemeral: true });
        }

        let data = fs.readFileSync('cuentas.txt', 'utf8').split('\n').filter(line => line.trim() !== '');

        if (data.length < cantidad) {
            return interaction.reply({ content: `❌ No hay suficientes cuentas en el stock. Quedan: ${data.length}`, ephemeral: true });
        }

        // 3. Extraer cuentas y actualizar archivo
        const cuentasGeneradas = data.splice(0, cantidad);
        fs.writeFileSync('cuentas.txt', data.join('\n'), 'utf8');

        // 4. Enviar al usuario (Solo él lo ve)
        const embedUsuario = new EmbedBuilder()
            .setTitle("🎮 Cuentas Generadas")
            .setDescription(`Has recibido **${cantidad}** cuenta(s):\n\`\`\`${cuentasGeneradas.join('\n')}\`\`\``)
            .setColor("#00ff00")
            .setTimestamp();

        await interaction.reply({ embeds: [embedUsuario], ephemeral: true });

        // 5. Enviar Log al canal de logs
        if (logsChannel) {
            const embedLog = new EmbedBuilder()
                .setTitle("⚠️ Alerta de Generación")
                .setColor("#ffaa00")
                .addFields(
                    { name: "👤 Usuario", value: `${interaction.user.tag} (${interaction.user.id})`, inline: false },
                    { name: "🔢 Cantidad", value: `${cantidad}`, inline: true },
                    { name: "📉 Stock Restante", value: `${data.length}`, inline: true }
                )
                .setTimestamp();

            logsChannel.send({ embeds: [embedLog] });
        }
    }
});

client.login(process.env.TOKEN);