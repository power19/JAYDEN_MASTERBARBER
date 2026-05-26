/**
 * Shop Info — edit the .env file or set these values directly here
 */
module.exports = {
  name:          process.env.SHOP_NAME         || "Jayden's Barbershop",
  address:       process.env.SHOP_ADDRESS      || 'Paramaribo, Suriname',
  phone:         process.env.SHOP_PHONE        || '+597 XXX-XXXX',
  email:         process.env.SHOP_EMAIL        || 'info@jaydensbarbershop.com',
  instagram:     process.env.SHOP_INSTAGRAM    || '@jaydensbarbershop',
  googleMapsLink:process.env.GOOGLE_MAPS_LINK  || '',
  currency:      process.env.CURRENCY          || 'SRD',
};
