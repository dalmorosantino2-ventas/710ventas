require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Events, ChannelType, PermissionFlagsBits, REST, Routes } = require('discord.js');
const fs = require('fs');

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// --- CONFIGURACIÓN PERSONALIZADA ---
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
    imagenProducto: 'https://cdn.discordapp.com/attachments/1474642509849165824/1474642978550054992/WhatsApp_Image_2026-02-21_at_2.20.18_AM.jpeg',
    imagenVentaCompletada: 'https://cdn.discordapp.com/attachments/1474642509849165824/1474642978550054992/WhatsApp_Image_2026-02-21_at_2.20.18_AM.jpeg',
    archivoCuentas: './accounts.txt'
};

const carritosAtivos = new Map();

// --- REGISTRO DE COMANDO /SETUP ---
const commands = [{
    name: 'setup',
    description: 'Crea el panel de venta inicial'
}];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

client.once('ready', async () => {
    console.clear();
    console.log(`✅ Bot Semiautomático Online: ${client.user.tag}`);
    
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('✅ Comando /setup registrado correctamente.');
    } catch (error) {
        console.error('❌ Error registrando comandos:', error);
    }
});

// --- LÓGICA DE COMANDOS ---
client.on(Events.InteractionCreate, async interaction => {
    // Manejar comando /setup
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'setup') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return interaction.reply({ content: '❌ No tienes permisos.', ephemeral: true });
            }

            const stock = fs.readFileSync(CONFIG.archivoCuentas, 'utf8').split('\n').filter(l => l.trim()).length;
            const embed = new EmbedBuilder()
                .setTitle(`${CONFIG.productoNombre} | Producto`)
                .setDescription('🇪🇸 - Cuenta de Steam FULL ACCES +60 Días.\n\nFull Access\n(MAIL:CONTRASEÑA).')
                .addFields(
                    { name: '💸 | Precio: ARS', value: `$${CONFIG.precioARS.toFixed(2)}`, inline: true },
                    { name: '💰 | Price: USD', value: `$${CONFIG.precioUSD.toFixed(2)}`, inline: true },
                    { name: '📦 | Stock:', value: `${stock}`, inline: true }
                )
                .setImage(CONFIG.imagenProducto)
                .setColor('#00ff77');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('abrir_ticket').setLabel('Comprar').setStyle(ButtonStyle.Success).setEmoji('🛒')
            );

            await interaction.reply({ embeds: [embed], components: [row] });
        }
    }

    if (!interaction.isButton()) return;

    const userId = interaction.user.id;
    const stockActual = fs.readFileSync(CONFIG.archivoCuentas, 'utf8').split('\n').filter(l => l.trim()).length;

    // 1. Abrir Ticket
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

    // Lógica de administrador para aprobar/rechazar
    if (interaction.customId.startsWith('aprobar_') || interaction.customId.startsWith('rechazar_')) {
        const [accion, targetId] = interaction.customId.split('_');
        if (accion === 'aprobar') {
            await procesarEntrega(targetId, interaction);
        } else {
            await interaction.channel.send('❌ Venta rechazada por el administrador.');
            setTimeout(() => interaction.channel.delete(), 5000);
            carritosAtivos.delete(targetId);
        }
        return;
    }

    // 2. Control del Carrito (Solo en el canal del ticket)
    const datos = carritosAtivos.get(userId);
    if (!datos || interaction.channel.id !== datos.ticketId) return;

    if (interaction.customId === 'sumar' || interaction.customId === 'restar') {
        let cant = datos.cantidad;
        if (interaction.customId === 'sumar' && cant < stockActual) cant++;
        if (interaction.customId === 'restar' && cant > 1) cant--;
        
        datos.cantidad = cant;
        carritosAtivos.set(userId, datos);
        await enviarMensajeCarrito(interaction.channel, interaction.user, cant, stockActual, true, interaction);
    }

    if (interaction.customId === 'ir_al_pago') {
        const totalARS = (datos.cantidad * CONFIG.precioARS).toFixed(2);
        const totalUSD = (datos.cantidad * CONFIG.precioUSD).toFixed(2);

        const embedPago = new EmbedBuilder()
            .setTitle('710 | Shop | Información de Pago')
            .setDescription(`🌍 **Producto:** ${CONFIG.productoNombre} x${datos.cantidad}\n` +
                            `💰 **Total a transferir:** ARS$${totalARS}\n\n` +
                            `**Realiza la transferencia desde Mercado Pago o cualquier banco a:**\n` +
                            `🔹 **Alias:** \`710shop\`\n` + 
                            `🔹 **Nombre:** ${CONFIG.nombreTitular}\n\n` +
                            `**Si pagas por PayPal ($${totalUSD} USD):**\n` +
                            `🔹 **Email:** \`${CONFIG.paypalEmail}\`\n\n` +
                            `⚠️ **IMPORTANTE:** Una vez realizada la transferencia, **sube la captura del comprobante** aquí y presiona el botón de abajo.`)
            .setColor('#5865F2')
            .setFooter({ text: 'Verificamos los pagos al instante.' });

        const rowPagos = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('pago_enviado')
                .setLabel('✅ Ya envié el comprobante')
                .setStyle(ButtonStyle.Success)
        );

        await interaction.update({ embeds: [embedPago], components: [rowPagos] });
    }

    // --- SOLUCIÓN AL ERROR DE INTERACCIÓN FALLIDA ---
    if (interaction.customId === 'pago_enviado') {
        // Confirmar al usuario inmediatamente
        await interaction.reply({ content: '🔔 **Aviso enviado.** Por favor espera a que verifiquemos tu pago.', ephemeral: false });
        
        // Mostrar panel para que TÚ apruebes
        const rowAdmin = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`aprobar_${userId}`).setLabel('Aprobar y Entregar').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`rechazar_${userId}`).setLabel('Rechazar Pago').setStyle(ButtonStyle.Danger)
        );

        await interaction.channel.send({ 
            content: `🛠️ **Panel Admin:** Verifica el dinero de **${interaction.user.username}** antes de aprobar.`, 
            components: [rowAdmin] 
        });
    }

    if (interaction.customId === 'cancelar') {
        await interaction.reply('❌ Compra cancelada. El ticket se cerrará...');
        setTimeout(() => interaction.channel.delete(), 5000);
        carritosAtivos.delete(userId);
    }
});

// Mantener funciones originales enviarMensajeCarrito y procesarEntrega...
async function enviarMensajeCarrito(channel, user, cantidad, stock, edit = false, interaction = null) {
    const embed = new EmbedBuilder()
        .setTitle('Saytus | Shop | Carrito de Compras')
        .setDescription(`👋 ¡Bienvenido ${user.username}!\n📦 **Producto:** \`${CONFIG.productoNombre}\`\n🔢 **Cantidad:** \`${cantidad}\`\n🛒 **Stock disponible:** ${stock}`)
        .setColor('#2b2d31');

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ir_al_pago').setLabel('Aceptar y Continuar').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('cancelar').setLabel('Cancelar Compra').setStyle(ButtonStyle.Danger)
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('sumar').setLabel('+').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('restar').setLabel('-').setStyle(ButtonStyle.Secondary)
    );

    const data = { embeds: [embed], components: [row1, row2] };
    if (edit) await interaction.update(data);
    else await channel.send({ content: `${user}`, ...data });
}

async function procesarEntrega(userId, interaction) {
    const datos = carritosAtivos.get(userId);
    const guild = interaction.guild;
    const member = await guild.members.fetch(userId);

    let cuentas = fs.readFileSync(CONFIG.archivoCuentas, 'utf8').split('\n').filter(l => l.trim());
    if (cuentas.length < datos.cantidad) return interaction.reply('❌ Error: Sin stock suficiente.');
    
    const entregadas = cuentas.splice(0, datos.cantidad);
    fs.writeFileSync(CONFIG.archivoCuentas, cuentas.join('\n'));

    const embedDM = new EmbedBuilder()
        .setTitle('✅ Saytus | Compra Completada')
        .setDescription(`¡Tu compra ha sido procesada!\n\n📦 **Productos:** \`${CONFIG.productoNombre} x${datos.cantidad}\`\n\n🔑 **Tus cuentas:**\n\`\`\`\n${entregadas.join('\n')}\n\`\`\``)
        .setColor('#00ff44');
    
    await member.send({ embeds: [embedDM] }).catch(() => console.log(`DM cerrado.`));

    const canalLogs = await guild.channels.fetch(CONFIG.canalLogsVentas);
    const embedLog = new EmbedBuilder()
        .setTitle('Saytus | Shop | Compra Aprobada')
        .setDescription(`**Nueva venta realizada 💳**\n\n👤 **| Comprador:**\n${member} (${member.user.username})\n\n🛒 **| Producto(s):**\n\`${CONFIG.productoNombre} (x${datos.cantidad})\`\n\n💸 **| Monto:**\nARS$${(datos.cantidad * CONFIG.precioARS).toFixed(2)}\n\n📅 **| Fecha:**\n${new Date().toLocaleString('es-AR')}`)
        .setImage(CONFIG.imagenVentaCompletada)
        .setColor('#ff9900')
        .setFooter({ text: 'Saytus | Shop - Sistema de Ventas Automático' });

    await canalLogs.send({ embeds: [embedLog] });

    await interaction.reply('✅ Venta aprobada. Ticket cerrándose...');
    setTimeout(() => interaction.channel.delete(), 5000);
    carritosAtivos.delete(userId);
}

client.login(process.env.DISCORD_TOKEN);