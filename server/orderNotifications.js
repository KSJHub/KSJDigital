function money(value, currency = 'GBP') {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
  }).format(Number(value || 0))
}

function maskEmail(email = '') {
  const [name = '', domain = ''] = email.split('@')
  if (!domain) return 'Not provided'
  const visible = name.slice(0, 1)
  return `${visible}${'*'.repeat(Math.max(3, name.length - 1))}@${domain}`
}

function countryFromAddress(address) {
  return address?.country || address?.countryCode || 'Not provided'
}

function variantText(item) {
  return [item.variant?.size && `Size: ${item.variant.size}`, item.variant?.colour && `Colour: ${item.variant.colour}`]
    .filter(Boolean)
    .join(' · ')
}

function itemLines(order) {
  return order.items.map(item => {
    const variant = variantText(item)
    return `${item.quantity} × ${item.name}${variant ? ` (${variant})` : ''} — ${money(item.total, order.currency)}`
  })
}

export function buildBuyerOrderEmail(order, settings = {}) {
  return {
    to: order.customer.email,
    replyTo: settings.replyTo || settings.supportEmail || '',
    subject: `${settings.brandName || order.clientName || 'Store'} Order Confirmed — ${order.orderNumber}`,
    text: [
      `Thank you for your order, ${order.customer.name}.`,
      '',
      `Order: ${order.orderNumber}`,
      `Status: ${order.paymentStatus}`,
      `Payment: ${order.provider}`,
      `Date: ${new Date(order.createdAt).toLocaleString('en-GB')}`,
      '',
      'Items:',
      ...itemLines(order),
      '',
      `Subtotal: ${money(order.subtotal, order.currency)}`,
      `Shipping: ${money(order.shipping, order.currency)}`,
      `Tax: ${money(order.tax, order.currency)}`,
      `Discount: ${money(order.discount, order.currency)}`,
      `Total: ${money(order.total, order.currency)}`,
      '',
      order.shippingMethod ? `Delivery method: ${order.shippingMethod}` : '',
      settings.deliveryMessage || 'Delivery and dispatch details will be confirmed separately.',
      '',
      settings.supportEmail ? `Support: ${settings.supportEmail}` : '',
      settings.returnsMessage || '',
    ]
      .filter(Boolean)
      .join('\n'),
  }
}

export function buildClientOrderEmail(order, settings = {}) {
  const address = order.shippingAddress || {}
  return {
    to: settings.orderEmail,
    subject: `New ${settings.brandName || order.clientName || 'Store'} Order — ${order.orderNumber} — ${money(order.total, order.currency)}`,
    text: [
      `New paid order received: ${order.orderNumber}`,
      '',
      `Payment status: ${order.paymentStatus}`,
      `Provider: ${order.provider}`,
      `Provider order ID: ${order.providerOrderId}`,
      `Transaction ID: ${order.providerTransactionId || 'Not supplied'}`,
      '',
      `Customer: ${order.customer.name}`,
      `Email: ${order.customer.email}`,
      order.customer.phone ? `Phone: ${order.customer.phone}` : '',
      '',
      'Delivery address:',
      address.line1 || '',
      address.line2 || '',
      address.city || '',
      address.region || '',
      address.postalCode || '',
      address.country || address.countryCode || '',
      '',
      'Items:',
      ...itemLines(order),
      '',
      `Subtotal: ${money(order.subtotal, order.currency)}`,
      `Shipping: ${money(order.shipping, order.currency)}`,
      `Tax: ${money(order.tax, order.currency)}`,
      `Discount: ${money(order.discount, order.currency)}`,
      `Total: ${money(order.total, order.currency)}`,
      `Shipping method: ${order.shippingMethod || 'Not supplied'}`,
      `Fulfilment status: ${order.fulfilmentStatus}`,
      order.customerNote ? `Customer note: ${order.customerNote}` : '',
      settings.manageUrl ? `Manage order: ${settings.manageUrl}/${order.id}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
  }
}

export function buildDiscordOrderPayload(order, settings = {}) {
  const productSummary = order.items
    .map(item => {
      const variant = variantText(item)
      return `**${item.quantity} × ${item.name}**${variant ? `\n${variant}` : ''}`
    })
    .join('\n\n')
    .slice(0, 1000)

  return {
    username: settings.webhookName || `${settings.brandName || order.clientName || 'Store'} Orders`,
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: `🛒 New Paid Order — ${order.orderNumber}`,
        description: productSummary,
        color: 0x22c55e,
        fields: [
          { name: 'Status', value: `✅ ${order.paymentStatus}`, inline: true },
          { name: 'Provider', value: order.provider || 'Unknown', inline: true },
          { name: 'Total', value: money(order.total, order.currency), inline: true },
          { name: 'Customer', value: order.customer.name || 'Not provided', inline: true },
          { name: 'Email', value: maskEmail(order.customer.email), inline: true },
          { name: 'Delivery', value: countryFromAddress(order.shippingAddress), inline: true },
          { name: 'Fulfilment', value: order.fulfilmentStatus || 'New', inline: true },
          { name: 'Items', value: String(order.items.length), inline: true },
          {
            name: 'Manage Order',
            value: settings.manageUrl ? `${settings.manageUrl}/${order.id}` : 'Open KSJ Digital Orders',
            inline: false,
          },
        ],
        footer: { text: 'Customer payment details and full address are not posted to Discord.' },
        timestamp: order.createdAt,
      },
    ],
  }
}
