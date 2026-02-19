// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

// Uncomment this line to use console.log
// import "hardhat/console.sol";

/*
Rôles
- Client : crée la mission, dépose le paiement, valide/refuse la livraison.
- Freelance : accepte la mission, livre, peut demander une validation.
- Arbitre (optionnel mais souhaité) : intervient en cas de litige et tranche.
- Visiteur : peut consulter uniquement si lien partagé (optionnel).

Droits
- Seul le client peut déposer l’argent et valider la livraison.
- Seul le freelance peut déclarer une livraison.
- Seul l’arbitre peut trancher un litige lorsqu’il est ouvert.
- Chaque action importante doit laisser une trace dans l’historique.
*/

contract EscrowFreelance {
    
    // --- Events ---
    event MissionCreated(uint256 indexed id, address indexed client, string title, uint256 paymentAmount);
    event MissionFunded(uint256 indexed id, uint256 amount);
    event MissionAccepted(uint256 indexed id, address indexed freelancer);
    event MissionDelivered(uint256 indexed id, uint256 deliveredAt, uint256 validationDeadline);
    event MissionApproved(uint256 indexed id, address indexed freelancer, uint256 amount);
    event MissionRefunded(uint256 indexed id, address indexed client, uint256 amount);
    event DeliveryDeadlineUpdated(uint256 indexed id, uint256 newDeadline);
    event MissionDisputed(uint256 indexed id, address indexed by, string reason);
    event MissionRejected(uint256 indexed id, uint256 newDeliveryDeadline, string message);
    event DisputeResolved(uint256 indexed id, bool paidFreelancer, uint256 amount); // si arbiter == true
    event MissionAutoApproved(uint256 indexed id, address indexed freelancer, uint256 amount); // Auto-approve si client ne répond pas (après validationDeadline)
    event MissionCancelled(uint256 indexed id);


    enum MissionStatus { Created, Funded, InProgress, Delivered, Approved, Rejected, Disputed, Refunded, Cancelled }

    struct Mission {
        address creator;
        string title;
        string description;
        string rejectionMessage; // message du client expliquant le rejet

        uint256 paymentAmount;       // montant attendu (en wei)
        uint256 escrowedAmount;      // montant réellement bloqué
        uint256 deliveryDeadline;    // deadline de livraison (timestamp)
        uint256 validationDeadline;  // deadline de validation (timestamp, calculée à la livraison)
        uint256 validationPeriod;    // ex: 3 days
        uint256 deliveredAt;         // timestamp de livraison

        bool arbiter;                // si true => arbitrage par l'entreprise (adresse owner)
        address freelancer;

        bool cancellationType; // Règles de remboursement/annulation (au moins 1 scénario standard)

        MissionStatus status; 
    }

    Mission[] public missions;


    // --- Simple reentrancy guard ---
    bool private _locked;
    modifier nonReentrant() {
        require(!_locked, "REENTRANCY");
        _locked = true;
        _;
        _locked = false;
    }

    modifier validId(uint256 missionId) {
        require(missionId < missions.length, "Invalid missionId");
        _;
    }

    modifier onlyFreelancer (uint256 missionId) {
        require(missionId < missions.length, "Invalid missionId");
        Mission storage m = missions[missionId];
        require(msg.sender == m.freelancer, "Only freelancer");
        _;
    }

    modifier onlyCreator (uint256 missionId) {
        require(missionId < missions.length, "Invalid missionId");
        Mission storage m = missions[missionId];
        require(msg.sender == m.creator, "Only creator");
        _;
    }

    modifier onlyParty(uint256 missionId) {
        require(missionId < missions.length, "Invalid missionId");
        Mission storage m = missions[missionId];
        require(msg.sender == m.creator || msg.sender == m.freelancer, "Only creator or freelancer can contest");
        _;
    }

    address public immutable owner;

    modifier onlyOwner () {
        require(msg.sender == owner, "Must be an owner");
        _;
    }
    
    constructor() {
        owner = msg.sender;
    }

    // ------------------------------
    ////////// Functions ////////////
    // ------------------------------

    receive() external payable {
        revert("Use fundMission");
    }

    fallback() external payable {
        revert("Unknown function");
    }

    function addMission(
        string memory _title,
        string memory _description,
        uint256 _paymentAmount,
        uint256 _deliveryDeadline,
        bool _arbiter,
        bool _cancellationType
    ) external returns (uint256) {
        require(_paymentAmount > 0, "paymentAmount must be > 0");
        require(_deliveryDeadline > block.timestamp, "deadline must be in the future");

        Mission memory m;
        m.creator = msg.sender;
        m.title = _title;
        m.description = _description;
        m.rejectionMessage = "";

        m.paymentAmount = _paymentAmount;
        m.escrowedAmount = 0;

        m.deliveryDeadline = _deliveryDeadline;

        m.validationPeriod = 3 days; // tu peux rendre ca configurable si tu veux
        m.validationDeadline = 0;    // sera calculé à la livraison
        m.deliveredAt = 0;

        m.arbiter = _arbiter;
        m.cancellationType = _cancellationType;

        m.status = MissionStatus.Created;

        missions.push(m);
        uint256 id = missions.length - 1;

        emit MissionCreated(id, msg.sender, _title, _paymentAmount);
        return id;
    }

    function fundMission(uint256 missionId) external payable validId(missionId) {
        Mission storage m = missions[missionId];

        require(msg.sender == m.creator, "Only creator");
        require(m.status == MissionStatus.Created, "Wrong status");
        require(msg.value == m.paymentAmount, "Send exact paymentAmount");

        m.escrowedAmount = msg.value;
        m.status = MissionStatus.Funded;

        emit MissionFunded(missionId, msg.value);
    }

    function cancelMission(uint256 missionId) external nonReentrant onlyCreator(missionId) {
        Mission storage m = missions[missionId];

        require(m.status != MissionStatus.Disputed, "Disputed");
        require(m.status != MissionStatus.Cancelled, "Already cancelled");
        require(m.status != MissionStatus.Approved, "Already approved");
        require(m.status != MissionStatus.Refunded, "Already refunded");

        // simple : autoriser seulement Created ou Funded (non accepté)
        require(m.status == MissionStatus.Created || m.status == MissionStatus.Funded, "Cannot cancel now");

        if (m.status == MissionStatus.Funded) {
            // pour éviter d'annuler après accept
            require(m.freelancer == address(0), "Already accepted");
            require(m.escrowedAmount > 0, "No funds");

            uint256 amount = m.escrowedAmount;

            // effets avant interaction
            m.escrowedAmount = 0;

            (bool ok, ) = payable(m.creator).call{value: amount}("");
            require(ok, "Refund failed");
        }

        m.status = MissionStatus.Cancelled;

        emit MissionCancelled(missionId);
    }


    function acceptMission(uint256 missionId) external validId(missionId) {
        Mission storage m = missions[missionId];

        require(m.status == MissionStatus.Funded, "Wrong status");
        require(m.freelancer == address(0), "Already accepted");

        m.freelancer = msg.sender; // le freelancer est celui qui accepte la mission
        m.status = MissionStatus.InProgress;

        emit MissionAccepted(missionId, msg.sender);
    }

    function deliverMission(uint256 missionId) external onlyFreelancer(missionId) {
        Mission storage m = missions[missionId];

        require(
            m.status == MissionStatus.InProgress || m.status == MissionStatus.Rejected,
            "Wrong status"
        );

        m.status = MissionStatus.Delivered;
        m.deliveredAt = block.timestamp;
        m.validationDeadline = block.timestamp + m.validationPeriod;

        emit MissionDelivered(missionId, m.deliveredAt, m.validationDeadline);
    }


    // ✅ Approval = paiement au freelance
    function approveMission(uint256 missionId) external nonReentrant onlyCreator(missionId) {
        Mission storage m = missions[missionId];

        require(m.status != MissionStatus.Disputed, "Disputed");
        require(m.status == MissionStatus.Delivered, "Wrong status");
        require(m.escrowedAmount > 0, "No funds");

        uint256 amount = m.escrowedAmount;

        // Effets avant interaction
        m.escrowedAmount = 0;
        m.status = MissionStatus.Approved;

        (bool ok, ) = payable(m.freelancer).call{value: amount}("");
        require(ok, "Payment failed");

        emit MissionApproved(missionId, m.freelancer, amount);
    }


    // Auto-aprove si le client ne répond pas (après validationDeadline)
    function autoApprove(uint256 missionId) external nonReentrant onlyFreelancer(missionId) {
        Mission storage m = missions[missionId];

        require(m.status == MissionStatus.Delivered, "Wrong status");
        require(m.status != MissionStatus.Disputed, "Disputed");
        require(m.escrowedAmount > 0, "No funds");
        require(block.timestamp > m.validationDeadline, "Too early (validation not passed)");

        uint256 amount = m.escrowedAmount;

        // effets avant interaction
        m.escrowedAmount = 0;
        m.status = MissionStatus.Approved;

        (bool ok, ) = payable(m.freelancer).call{value: amount}("");
        require(ok, "Payment failed");

        emit MissionAutoApproved(missionId, m.freelancer, amount);
    }


    function disputeMission(uint256 missionId, string calldata reason)
        external
        onlyParty(missionId)
    {
        Mission storage m = missions[missionId];

        require(
            m.status == MissionStatus.InProgress || m.status == MissionStatus.Delivered || m.status == MissionStatus.Rejected,
            "Wrong status"
        );

        m.status = MissionStatus.Disputed;

        emit MissionDisputed(missionId, msg.sender, reason);
    }

    function rejectMission(
        uint256 missionId,
        uint256 extraTime, // ex: 2 days, 3600, etc.
        string calldata message
    ) external onlyCreator(missionId) {
        Mission storage m = missions[missionId];

        require(m.status != MissionStatus.Disputed, "Disputed");
        require(m.status == MissionStatus.Delivered, "Wrong status");
        require(bytes(message).length > 0, "Message required");
        require(extraTime > 0, "extraTime must be > 0");
        require(m.escrowedAmount > 0, "No funds");

        m.status = MissionStatus.Rejected;
        m.rejectionMessage = message;

        // prolonge la deadline du montant choisi
        m.deliveryDeadline = block.timestamp + extraTime; // On prolonge à partir du moment ou la fonction est appelé

        emit MissionRejected(missionId, m.deliveryDeadline, message);
    }

    function getRejectionMessage(uint256 missionId) external view validId(missionId) returns (string memory) {
        return missions[missionId].rejectionMessage;
    }


    function resolveDispute(uint256 missionId, bool payFreelancer)
        external
        nonReentrant
        onlyOwner
    {
        Mission storage m = missions[missionId];

        require(m.arbiter, "No arbiter for this mission");
        require(m.status == MissionStatus.Disputed, "Not disputed");
        require(m.escrowedAmount > 0, "No funds");

        uint256 amount = m.escrowedAmount;

        // effets avant interaction
        m.escrowedAmount = 0;

        if (payFreelancer) {
            m.status = MissionStatus.Approved;
            (bool ok, ) = payable(m.freelancer).call{value: amount}("");
            require(ok, "Payment failed");
        } else {
            m.status = MissionStatus.Refunded;
            (bool ok, ) = payable(m.creator).call{value: amount}("");
            require(ok, "Refund failed");
        }

        emit DisputeResolved(missionId, payFreelancer, amount);
    }




    // Refund = possibilité de claim (pas automatique)
    // - Autorisé si deadline dépassée
    // - MAIS tu peux toujours repousser la deadline avec updateDeliveryDeadline()
    // - Et tu peux continuer même après dépassement (tant que tu ne refund pas)
    function refundMission(uint256 missionId) external nonReentrant onlyCreator(missionId) {
        Mission storage m = missions[missionId];

        require(m.status != MissionStatus.Disputed, "Disputed");
        require(m.status != MissionStatus.Approved, "Already approved");
        require(m.status != MissionStatus.Refunded, "Already refunded");
        require(m.status != MissionStatus.Cancelled, "Cancelled");
        require(m.escrowedAmount > 0, "No funds");

        // le client ne peut claim refund qu'après la deliveryDeadline
        require(block.timestamp > m.deliveryDeadline, "Too early (delivery deadline not passed)");

        // refund possible seulement si pas livré dans les temps :
        // - soit jamais livré (deliveredAt == 0)
        // - soit livré mais en retard (deliveredAt > deliveryDeadline)
        require(m.deliveredAt == 0 || m.deliveredAt > m.deliveryDeadline, "Delivered in time");

        uint256 amount = m.escrowedAmount;

        // Reentrency
        m.escrowedAmount = 0;
        m.status = MissionStatus.Refunded;

        (bool ok, ) = payable(m.creator).call{value: amount}("");
        require(ok, "Refund failed");

        emit MissionRefunded(missionId, m.creator, amount);
    }

    // ✅ Permet de repousser la deadline (même si elle est déjà dépassée)
    // Tant que pas Approved/Refunded/Cancelled
    function updateDeliveryDeadline(uint256 missionId, uint256 newDeadline) external onlyCreator(missionId) {
        Mission storage m = missions[missionId];

        require(m.status != MissionStatus.Approved, "Already approved");
        require(m.status != MissionStatus.Refunded, "Already refunded");
        require(m.status != MissionStatus.Cancelled, "Cancelled");

        require(newDeadline > block.timestamp, "New deadline must be future");

        m.deliveryDeadline = newDeadline;

        emit DeliveryDeadlineUpdated(missionId, newDeadline);
    }

    // (optionnel) visibilité pratique
    function missionsCount() external view returns (uint256) {
        return missions.length;
    }
}