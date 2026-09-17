#include "CitySkeletonActor.h"
#include "CoordinateBridge.h"
#include "Components/InstancedStaticMeshComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Components/TextRenderComponent.h"
#include "Engine/StaticMesh.h"
#include "UObject/ConstructorHelpers.h"

AShenchengjiCitySkeletonActor::AShenchengjiCitySkeletonActor()
{
	PrimaryActorTick.bCanEverTick = false;
	Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	SetRootComponent(Root);

	GroundMesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Ground"));
	GroundMesh->SetupAttachment(Root);
	GroundMesh->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);
	GroundMesh->SetCollisionResponseToAllChannels(ECR_Block);

	BuildingsMesh = CreateDefaultSubobject<UInstancedStaticMeshComponent>(TEXT("Buildings"));
	BuildingsMesh->SetupAttachment(Root);
	BuildingsMesh->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);

	RoadsMesh = CreateDefaultSubobject<UInstancedStaticMeshComponent>(TEXT("Roads"));
	RoadsMesh->SetupAttachment(Root);
	RoadsMesh->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);

	static ConstructorHelpers::FObjectFinder<UStaticMesh> CubeFinder(TEXT("/Engine/BasicShapes/Cube.Cube"));
	if (CubeFinder.Succeeded())
	{
		GroundMesh->SetStaticMesh(CubeFinder.Object);
		BuildingsMesh->SetStaticMesh(CubeFinder.Object);
		RoadsMesh->SetStaticMesh(CubeFinder.Object);
	}
}

void AShenchengjiCitySkeletonActor::AddMarker(const FShenchengjiGamePoint& Point, const FLinearColor& Color)
{
	UTextRenderComponent* Text = NewObject<UTextRenderComponent>(this);
	Text->RegisterComponent();
	Text->AttachToComponent(Root, FAttachmentTransformRules::KeepRelativeTransform);
	Text->SetWorldLocation(FShenchengjiCoordinateBridge::GameToUnreal(Point.X, Point.Z, 6.0));
	Text->SetText(FText::FromString(Point.Name.IsEmpty() ? Point.Id : Point.Name));
	Text->SetTextRenderColor(Color.ToFColor(true));
	Text->SetWorldSize(180.f);
	Text->SetHorizontalAlignment(EHTA_Center);
}

void AShenchengjiCitySkeletonActor::BuildFromSkeleton(const FShenchengjiCitySkeleton& Skeleton)
{
	Cached = Skeleton;
	BuildingsMesh->ClearInstances();
	RoadsMesh->ClearInstances();

	double MinX = 0, MinZ = 0, MaxX = 0, MaxZ = 0;
	bool bBounds = false;
	auto Expand = [&](double X, double Z)
	{
		if (!bBounds)
		{
			MinX = MaxX = X;
			MinZ = MaxZ = Z;
			bBounds = true;
			return;
		}
		MinX = FMath::Min(MinX, X);
		MaxX = FMath::Max(MaxX, X);
		MinZ = FMath::Min(MinZ, Z);
		MaxZ = FMath::Max(MaxZ, Z);
	};

	for (const TPair<FString, FShenchengjiGamePoint>& Pair : Skeleton.Places)
	{
		Expand(Pair.Value.X, Pair.Value.Z);
		AddMarker(Pair.Value, FLinearColor(1.f, 0.82f, 0.28f));
	}

	for (const FShenchengjiSkeletonBuilding& Building : Skeleton.Buildings)
	{
		Expand(Building.X, Building.Z);
		const FVector Location = FShenchengjiCoordinateBridge::GameToUnreal(Building.X, Building.Z, Building.Height * 0.5);
		const FVector Scale(Building.W, Building.D, FMath::Max(4.0, Building.Height));
		BuildingsMesh->AddInstance(FTransform(FRotator::ZeroRotator, Location, Scale));
	}

	for (const FShenchengjiSkeletonRoad& Road : Skeleton.Roads)
	{
		for (int32 Index = 1; Index < Road.Points.Num(); ++Index)
		{
			const FVector2D A = Road.Points[Index - 1];
			const FVector2D B = Road.Points[Index];
			Expand(A.X, A.Y);
			Expand(B.X, B.Y);
			const FVector Start = FShenchengjiCoordinateBridge::GameToUnreal(A.X, A.Y, 0.08);
			const FVector End = FShenchengjiCoordinateBridge::GameToUnreal(B.X, B.Y, 0.08);
			const FVector Mid = (Start + End) * 0.5;
			const double Length = FVector::Distance(Start, End);
			if (Length < 40.0)
			{
				continue;
			}
			const FRotator Rotation = (End - Start).Rotation();
			const FVector Scale(Length / 100.0, FMath::Max(3.0, Road.Width), 0.16);
			RoadsMesh->AddInstance(FTransform(Rotation, Mid, Scale));
		}
	}

	if (bBounds)
	{
		const double Pad = 400.0;
		const double CenterX = (MinX + MaxX) * 0.5;
		const double CenterZ = (MinZ + MaxZ) * 0.5;
		const double SizeX = (MaxX - MinX) + Pad * 2;
		const double SizeZ = (MaxZ - MinZ) + Pad * 2;
		GroundMesh->SetWorldLocation(FShenchengjiCoordinateBridge::GameToUnreal(CenterX, CenterZ, -1.0));
		GroundMesh->SetWorldScale3D(FVector(SizeX, SizeZ, 2.0));
	}
}

void AShenchengjiCitySkeletonActor::TeleportPawnToPlace(APawn* Pawn, const FString& PlaceId) const
{
	if (!Pawn)
	{
		return;
	}
	const FShenchengjiGamePoint* Point = Cached.Places.Find(PlaceId);
	if (!Point)
	{
		return;
	}
	Pawn->SetActorLocationAndRotation(
		FShenchengjiCoordinateBridge::GameToUnreal(Point->X, Point->Z, 1.4),
		FShenchengjiCoordinateBridge::GameYawToUnreal(Point->Yaw),
		false,
		nullptr,
		ETeleportType::TeleportPhysics);
}

void AShenchengjiCitySkeletonActor::HideProxyCity()
{
	if (BuildingsMesh)
	{
		BuildingsMesh->SetHiddenInGame(true);
	}
	if (RoadsMesh)
	{
		RoadsMesh->SetHiddenInGame(true);
		RoadsMesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	}
}

void AShenchengjiCitySkeletonActor::BeginPlay()
{
	Super::BeginPlay();
}
