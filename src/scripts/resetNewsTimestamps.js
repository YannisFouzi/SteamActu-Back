require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/User");

// Fonction pour réinitialiser les horodatages des actualités
async function resetNewsTimestamps() {
  try {
    console.log("Connexion à la base de données...");
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log(
      "Réinitialisation des horodatages des actualités pour tous les utilisateurs..."
    );

    // Mettre à jour tous les utilisateurs pour réinitialiser lastNewsTimestamp pour tous les jeux suivis
    const result = await User.updateMany(
      {},
      { $set: { "followedGames.$[].lastNewsTimestamp": 0 } }
    );

    console.log(
      `Opération terminée : ${result.modifiedCount} utilisateurs mis à jour.`
    );
    console.log("Les horodatages ont été réinitialisés avec succès.");

    // Déconnexion de la base de données
    await mongoose.disconnect();
    console.log("Déconnexion réussie.");
  } catch (error) {
    console.error("Erreur lors de la réinitialisation des horodatages:", error);
    process.exit(1);
  }
}

// Exécution avec confirmation
console.log(
  "⚠️  ATTENTION : Vous êtes sur le point de réinitialiser les horodatages des actualités pour tous les utilisateurs."
);
console.log(
  "Cette opération forcera l'application à récupérer à nouveau toutes les actualités depuis Steam."
);
console.log('Pour continuer, appuyez sur "y" puis Entrée.');

process.stdin.once("data", (data) => {
  const input = data.toString().trim().toLowerCase();
  if (input === "y" || input === "yes") {
    resetNewsTimestamps();
  } else {
    console.log("Opération annulée.");
    process.exit(0);
  }
});
