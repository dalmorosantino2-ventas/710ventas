require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Events, ChannelType, PermissionFlagsBits, REST, Routes } = require('discord.js');
const fs = require('fs');

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// --- CONFIGURACIÓN ---
const CONFIG = {
    productoNombre: 'Steam Account',
    precioARS: 30.00,
    precioUSD: 0.50,
    alias: '710shop', 
    nombreTitular: 'Santino Dal Moro', 
    paypalEmail: 'la710storeshop@gmail.com',
    linkMP: 'https://link.mercadopago.com.ar/710shop',
    categoriaTickets: '1477028669166846014',
    canalLogsVentas: '1469619944676135033',
    canalPanelVenta: 'TU_ID_DE_CANAL_DE_VENTA', // DEBES PONER EL ID DEL CANAL DONDE ESTÁ EL PANEL
    imagenProducto: 'https://cdn.discordapp.com/attachments/1474642509849165824/1474642978550054992/WhatsApp_Image_2026-02-21_at_2.20.18_AM.jpeg',
    archivoCuentas: './accounts.txt'
};

const carritosAtivos = new Map();
let panelMessageId = null; // Para rastrear el mensaje del panel y actualizarlo

// --- FUNCIÓN PARA OBTENER STOCK ACTUAL ---
function obtenerStock() {
    try {
        const contenido = fs.readFileSync(CONFIG.archivoCuentas, 'utf8');
        return contenido.split('\n').map(l => l.trim()).filter(l => l.length > 0).length;
    } catch (e) {
        return 0;
    }
}

// --- FUNCIÓN PARA ACTUALIZAR EL PANEL EN TIEMPO REAL ---
async function actualizarPanelStock(guild) {
    if (!CONFIG.canalPanelVenta) return;
    
    const canal = await guild.channels.fetch(CONFIG.canalPanelVenta).catch(() => null);
    if (!canal) return;

    const stock = obtenerStock();
    const embed = new EmbedBuilder()
        .setTitle(`${CONFIG.productoNombre} | Producto`)
        .setDescription('🇪🇸 **- Cuenta de Steam FULL ACCES +60 Días.**\n\n> Full Access\n> (MAIL:CONTRASEÑA).')
        .addFields(
            { name: '💸 | **Precio: ARS**', value: `$${CONFIG.precioARS.toFixed(2)}`, inline: true },
            { name: '💰 | **Price: USD**', value: `$${CONFIG.precioUSD.toFixed(2)}`, inline: true },
            { name: '📦 | **Stock:**', value: `${stock}`, inline: true }
        )
        .setImage(CONFIG.imagenProducto)
        .setColor('#00ff77');

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('abrir_ticket').setLabel('Comprar').setStyle(ButtonStyle.Success).setEmoji('🛒')
    );

    // Intentar buscar el último mensaje del bot para editarlo o enviar uno nuevo
    const mensajes = await canal.messages.fetch({ limit: 10 });
    const botMsg = mensajes.find(m => m.author.id === client.user.id && m.embeds.length > 0);

    if (botMsg) {
        await botMsg.edit({ embeds: [embed], components: [row] });
    } else {
        await canal.send({ embeds: [embed], components: [row] });
    }
}

client.on(Events.InteractionCreate, async interaction => {
    // Comando Setup
    if (interaction.isChatInputCommand() && interaction.commandName === 'setup') {
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return;
        CONFIG.canalPanelVenta = interaction.channelId; // Guarda el canal actual como el del panel
        await actualizarPanelStock(interaction.guild);
        return interaction.reply({ content: '✅ Panel configurado y stock sincronizado.', ephemeral: true });
    }

    if (!interaction.isButton()) return;
    const userId = interaction.user.id;
    const stockActual = obtenerStock();

    // Abrir Ticket
    if (interaction.customId === 'abrir_ticket') {
        if (stockActual <= 0) return interaction.reply({ content: '❌ No hay stock disponible.', ephemeral: true });
        
        const channel = await interaction.guild.channels.create({
            name: `🛒-compra-${interaction.user.username}`,
            type: ChannelType.GuildText,
            parent: CONFIG.categoriaTickets,
            permissionOverwrites: [
                { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                { id: userId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
            ],
        });

        carritosAtivos.set(userId, { cantidad: 1, ticketId: channel.id });
        await enviarMensajeCarrito(channel, interaction.user, 1, stockActual);
        await interaction.reply({ content: `✅ Carrito abierto en ${channel}`, ephemeral: true });
    }

    // Aprobación (Aquí es donde baja el stock en tiempo real)
    if (interaction.customId.startsWith('aprobar_')) {
        const targetId = interaction.customId.split('_')[1];
        await procesarEntrega(targetId, interaction);
        // ACTUALIZACIÓN EN TIEMPO REAL: Después de entregar, actualiza el panel principal
        await actualizarPanelStock(interaction.guild); 
    }
    
    // ... (Mantener resto de botones: sumar, restar, ir_al_pago, pago_enviado, cancelar)
});

async function procesarEntrega(userId, interaction) {
    const datos = carritosAtivos.get(userId);
    const guild = interaction.guild;
    const member = await guild.members.fetch(userId);

    // 1. Leer stock real del archivo
    let contenido = fs.readFileSync(CONFIG.archivoCuentas, 'utf8');
    let cuentas = contenido.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    if (cuentas.length < datos.cantidad) return interaction.reply('❌ Error: Stock insuficiente.');
    
    // 2. Extraer las cuentas del archivo (ejemplo: si compró 2, saca 2)
    const entregadas = cuentas.splice(0, datos.cantidad);
    fs.writeFileSync(CONFIG.archivoCuentas, cuentas.join('\n'));

    // 3. Construir el mensaje con el formato de bloques numerados
    let textoEntrega = "";
    entregadas.forEach((cuentaReal, index) => {
        // Cada cuenta se imprime en su propia línea con su número
        textoEntrega += `📦 | **Entrega del Producto: ${CONFIG.productoNombre} - ${index + 1}/${datos.cantidad}**\n${cuentaReal}\n\n`;
    });

    const embedDM = new EmbedBuilder()
        .setTitle('✅ 710 | Compra Completada')
        .setDescription(`¡Tu compra ha sido procesada!\n\n${textoEntrega}`)
        .setColor('#00ff44');
    
    // 4. Enviar al privado del usuario
    await member.send({ embeds: [embedDM] }).catch(() => console.log("MDs cerrados"));

    // 5. Actualizar stock en el panel principal en tiempo real
    await actualizarPanelStock(interaction.guild); 

    await interaction.reply('✅ Venta aprobada y cuentas enviadas.');
    setTimeout(() => interaction.channel.delete(), 5000);
    carritosAtivos.delete(userId);
}

// ... (Resto de funciones auxiliares)
client.login(process.env.DISCORD_TOKEN);