const config = require('../config');

function publishControl(client, payload) {
  return new Promise((resolve, reject) => {
    client.publish(
      config.mqtt.topics.control,
      JSON.stringify(payload),
      { qos: 0 },
      (err) => (err ? reject(err) : resolve())
    );
  });
}

module.exports = { publishControl };
