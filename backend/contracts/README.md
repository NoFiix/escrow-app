# Sample Hardhat Project

This project demonstrates a basic Hardhat use case. It comes with a sample contract, a test for that contract, and a Hardhat Ignition module that deploys that contract.

Try running some of the following tasks:

```shell
npx hardhat help
npx hardhat test
REPORT_GAS=true npx hardhat test
npx hardhat node
npx hardhat ignition deploy ./ignition/modules/Lock.ts
```

// --------------------------------------------------------------------------------------------------


1.	Objectif du contrat
Ce smart contract sert de tiers de confiance pour des missions freelance :
•	Le client crée une mission et bloque l’argent dans le contrat.
•	Le freelance accepte la mission et livre.
•	Le client valide (et paye) ou rejette (avec message + nouvelle deadline).
•	Si le client ne répond pas après un certain délai, le freelance peut déclencher un auto-paiement.
•	En cas de conflit, les deux peuvent ouvrir un litige, et l’owner (l’entreprise) peut trancher si l’option arbitrage est activée.
________________________________________


2.	Rôles
•	creator / client : mission.creator (celui qui crée + finance + valide/refuse)
•	freelancer : mission.freelancer (celui qui accepte + livre + peut auto-approve)
•	owner : owner (adresse du déployeur du contrat, peut résoudre un litige si arbitrage activé)
________________________________________


3.	États (MissionStatus)
Une mission passe par plusieurs états :
•	Created : mission créée (pas encore financée)
•	Funded : mission financée (l’argent est dans le contrat)
•	InProgress : mission acceptée par un freelance
•	Delivered : travail livré
•	Approved : mission validée + paiement effectué au freelance
•	Rejected : client rejette la livraison, laisse un message, et prolonge la deadline
•	Disputed : litige ouvert (bloque approve/refund tant que non résolu)
•	Refunded : client remboursé
•	Cancelled : mission annulée (avant accept)
________________________________________


4.	Données importantes dans Mission
•	paymentAmount : montant attendu (en wei)
•	escrowedAmount : montant réellement bloqué dans le contrat (en wei)
•	deliveryDeadline : date limite de livraison (timestamp)
•	deliveredAt : moment exact de la livraison (timestamp) → sert à savoir si livré “dans les temps”
•	validationPeriod : délai de validation après livraison (fixé à 3 jours)
•	validationDeadline : date limite pour que le client réponde après livraison
•	rejectionMessage : message du client en cas de rejet
•	arbiter : si true, l’owner peut trancher un litige
________________________________________


5.	Fonctions (liste + explication simple)
receive() / fallback()
•	receive() : si quelqu’un envoie de l’ETH “directement” au contrat (sans appeler une fonction), ça revert avec "Use fundMission".
•	fallback() : si quelqu’un appelle une fonction qui n’existe pas (ou envoie des données inconnues), ça revert avec "Unknown function".
Différence rapide :
•	receive() = transfert ETH sans data
•	fallback() = appel inconnu / data inconnue
________________________________________
addMission(title, description, paymentAmount, deliveryDeadline, arbiter, cancellationType) -> id
Crée une mission :
•	vérifie que paymentAmount > 0
•	vérifie que deliveryDeadline est dans le futur
•	enregistre la mission en Created
•	émet MissionCreated
________________________________________
fundMission(missionId) (payable)
Le client finance la mission :
•	uniquement le creator
•	uniquement si la mission est Created
•	exige msg.value == paymentAmount
•	stocke l’ETH dans escrowedAmount
•	passe en Funded
•	émet MissionFunded
________________________________________
cancelMission(missionId)
Annule une mission avant qu’elle soit vraiment lancée :
•	uniquement le creator
•	seulement si Created ou Funded
•	si Funded : autorisé seulement si pas encore acceptée (freelancer == address(0))
•	si elle était financée, le contrat rembourse le client
•	passe en Cancelled
•	émet MissionCancelled
________________________________________
acceptMission(missionId)
Le freelance accepte la mission :
•	uniquement si la mission est Funded
•	seulement si personne ne l’a déjà acceptée (freelancer == address(0))
•	définit freelancer = msg.sender
•	passe en InProgress
•	émet MissionAccepted
________________________________________
deliverMission(missionId)
Le freelance livre le travail :
•	uniquement le freelancer
•	seulement si InProgress ou Rejected (permet de relivrer après un rejet)
•	passe en Delivered
•	enregistre deliveredAt = block.timestamp
•	calcule validationDeadline = now + validationPeriod
•	émet MissionDelivered
________________________________________
approveMission(missionId)
Le client valide et paye le freelance :
•	uniquement le creator
•	seulement si Delivered
•	interdit si Disputed
•	transfère escrowedAmount au freelancer
•	met escrowedAmount = 0
•	passe en Approved
•	émet MissionApproved
________________________________________
autoApprove(missionId)
Protection du freelance si le client “ghost” :
•	uniquement le freelancer
•	seulement si Delivered
•	interdit si Disputed
•	seulement si now > validationDeadline
•	paie le freelance automatiquement
•	met escrowedAmount = 0
•	passe en Approved
•	émet MissionAutoApproved
Idée simple :
Si le client ne répond pas pendant X jours après livraison, le freelance peut déclencher son paiement.
________________________________________
rejectMission(missionId, extraTime, message)
Le client rejette la livraison et demande des corrections :
•	uniquement le creator
•	seulement si Delivered
•	interdit si Disputed
•	stocke rejectionMessage
•	passe en Rejected
•	prolonge la deadline : deliveryDeadline = now + extraTime
•	émet MissionRejected
________________________________________
getRejectionMessage(missionId) -> string
Permet de lire le message de rejet (utile côté front).
________________________________________
disputeMission(missionId, reason)
Ouvre un litige :
•	appelable par le creator ou le freelancer
•	possible si InProgress, Delivered ou Rejected
•	passe en Disputed
•	émet MissionDisputed
________________________________________
resolveDispute(missionId, payFreelancer)
Trancher un litige (arbitrage) :
•	uniquement owner
•	seulement si arbiter == true
•	seulement si mission Disputed
•	si payFreelancer == true → paie le freelance, état Approved
•	sinon → rembourse le client, état Refunded
•	met escrowedAmount = 0
•	émet DisputeResolved
________________________________________
refundMission(missionId)
Le client peut récupérer l’argent si le freelance n’a pas livré dans les temps :
•	uniquement le creator
•	interdit si Disputed
•	seulement après now > deliveryDeadline
•	condition “pas livré dans les temps” :
o	soit deliveredAt == 0 (jamais livré)
o	soit deliveredAt > deliveryDeadline (livré en retard)
•	rembourse le client
•	met escrowedAmount = 0
•	passe en Refunded
•	émet MissionRefunded
________________________________________
updateDeliveryDeadline(missionId, newDeadline)
Le client peut repousser la deadline :
•	uniquement le creator
•	interdit si Approved, Refunded, Cancelled
•	exige newDeadline dans le futur
•	met à jour deliveryDeadline
•	émet DeliveryDeadlineUpdated
________________________________________
missionsCount()
Retourne le nombre total de missions.
________________________________________


6.	Résumé du flux “normal”
•	Client : addMission → Created
•	Client : fundMission → Funded (ETH bloqué)
•	Freelance : acceptMission → InProgress
•	Freelance : deliverMission → Delivered + validationDeadline
•	Client : approveMission → Approved (paiement)
________________________________________


7.	Flux alternatifs
•	Client rejette : rejectMission → Rejected → freelance relivre via deliverMission
•	Client ne répond pas : freelance autoApprove après validationDeadline
•	Litige : disputeMission → Disputed → resolveDispute par owner si arbitrage activé
•	Pas livré dans les temps : client refundMission après deliveryDeadline
